# Security review — Drawing per-mark revision (S39), 2026-10-20

- Branch: `dev-t-drawing-revision` @ `c548594` vs `58ad7e3` (44 files)
- Scope: `backend/src/modules/drawings/**`, migration `20261020100000_drawing_mark_rev`, `mo-print` drawing pick, `src/api/drawings.ts`, `src/hooks/useDrawings.ts`, `src/components/drawings/**`, `src/pages/DrawingList.tsx`
- Reviewer role: security (review-only, OWASP API Top 10 2023)
- No remote DB queried.

## Verdict: WARN (0 Critical, 0 High, 2 Medium [1 pre-existing], 3 Low, 4 Info)

## Checks with no finding

- **Fixes from earlier rounds, re-verified.**
  - **IDOR on the client file key: closed.** The client no longer sends a final key. `assertUploadKeyOwnership` (`drawings.service.ts`) checks three things: zone ∈ project, sub-zone ∈ zone, and the `upload_key` prefix is `drawings/_incoming/<that project's code>/`. `buildExpectedFileKey` then builds the final key from DB-sourced codes. `assertSafeFinalKey` re-checks the prefix before any storage call.
  - **Path traversal: closed.** Three layers check it. The DTO rejects a `mark` of `.`/`..` or containing `/`/`\`, and rejects a `file_name` with a leading `.` or containing `/`/`\`. The `upload_key` regex allows exactly one segment per position and requires a 36-char hex/dash uuid. `hasTraversalSegment` runs on both the `upload_key` and the final key. The local driver's `path.join` can no longer be steered.
- **Customer gate (API1/API5).** `isCustomerUser` reads `res_users.user_type` from the DB, the same signal as `CustomerScopeInterceptor`. The global interceptor default-denies customers on every route that lacks `@CustomerAccessible`, so `POST`, `DELETE`, `bom-marks` and `latest-version` are all 403 for customers. On `GET /drawings` the interceptor resolves the owner of `zone_id` and of `sub_zone_id` separately, so mixing an owned zone with a foreign sub-zone returns 404. The response is current rev only, `.pdf` only, with no `uploaded_by` join (API3).
- **Content-type / stored XSS (F-001 of 2026-09-14).** The design is better than before. The server now rewrites every stored drawing with `putObject(finalKey, a3, 'application/pdf')`, so the `Content-Type` served back for a drawing comes from the server, not the client. `mime_type` from the client is stored in the DB, but no frontend code reads it to type a blob.
- **pdf-lib on untrusted input.** `PDFDocument.load` runs without `ignoreEncryption`, so encrypted or corrupt files throw, and the code returns a 400 and deletes the staged object. pdf-lib is pure JS with no native parser, so memory-corruption bugs are not a concern. The one remaining risk is resource consumption (F-1).
- **Input validation.** `ValidationPipe({ whitelist: true, transform: true })` runs globally. `QueryDrawingDto` makes `zone_id`/`sub_zone_id` ints ≥ 1. Prisma uses parameterized queries everywhere, and there is no `$queryRawUnsafe`.
- **Migration.** It is additive: 2 nullable columns, one `DROP NOT NULL`, and an index. The backfill is a fixed regex `UPDATE` with no user input. Nothing is destroyed.
- **mo-print.** The only change is to pick the drawing by highest `rev`/`mark` instead of `version`, using the same rows. It adds no new data exposure.
- **Frontend.** Mark, file name and rev render through React text nodes, with no `dangerouslySetInnerHTML`. The staging key uses `crypto.randomUUID()`. The 50 MB size limit and the 1500-file limit are enforced in the client only (see F-1).

## Findings

### F-1 — No server-side size cap or work bound before buffering and pdf-lib processing of the staged PDF (new in this diff)
- **Severity:** Medium · **OWASP:** API4:2023 Unrestricted Resource Consumption
- **Where:** `backend/src/modules/drawings/drawings.service.ts` `create()` calls `fileStorage.getObject(dto.upload_key)` and then `toA3Landscape(original)`. `backend/src/modules/drawings/a3-normalize.ts` does `PDFDocument.load`, then `embedPage` per page, then `save()`. `gcs.driver.ts` `getObject` reads the whole object into one Buffer.
- **What:** The 50 MB limit lives only in `DrawingUploadModal.tsx` (`MAX_DRAWING_SIZE`). The GCS v4 signed PUT has no `x-goog-content-length-range`, so any authenticated employee can stage an object of any size and then `POST /drawings`. The server then:
  - downloads the whole object into memory;
  - parses it with pdf-lib synchronously on the event loop;
  - decodes the content stream of every page (`embedPage`/`save`), which also makes a small flate-bomb or a PDF with many pages expensive;
  - builds a second full copy of the output.
  Before this branch, `create()` never read the file bytes, so this exposure is new.
- **Why:** One request can out-of-memory crash or stall a Cloud Run instance, taking down every user's requests on that instance. 1500-file batches from the real UI also run serially through the same path. The risk is limited to authenticated internal users, and there is no rate limiting (pre-existing API4 gap).
- **Fix (route → backend):**
  - Call `fileStorage.getMetadata(upload_key)` before `getObject`, and reject `size > 50 MB` with a 400 (and delete the staged object).
  - Cap the page count after `load` (for example, ≤ 50 pages per sheet file).
  - Optionally move normalisation to a worker or child process with a memory limit.

### F-2 — `POST /file-storage/presigned-upload` signs a PUT for any key for any JWT user (PRE-EXISTING, outside this diff)
- **Severity:** Medium (same rating as `2026-08-24-drawing-gcs-dxf.md` F-01 and the risk-register entry) · **OWASP:** API1:2023 BOLA / API5:2023 BFLA
- **Where:** `backend/src/modules/file-storage/file-storage.controller.ts` `presignedUpload()`. The content-type is allowlisted, but the key is not checked at all.
- **What:** Any authenticated user can mint a signed PUT URL for any bucket key, including a final drawing key such as `drawings/<proj>/<zone>/<mark>/rev<n>/<file>.pdf` (these keys are predictable from the visible project/zone/mark/rev), BOM xlsx keys, and so on.
- **Why it matters for this branch:** The new design promises that only the server writes final drawing keys, after it has validated and A3-normalised the bytes. This endpoint bypasses that promise. An attacker can overwrite a current sheet with arbitrary, un-normalised `application/pdf` or `application/octet-stream` bytes without creating a DB row or audit trace. Those bytes are then served to customers and embedded by mo-print. The branch does not make this worse in reach, but the server-built-key guarantee only holds once this is fixed.
- **Fix (route → backend, pattern decision → security):** Restrict `key` to `^drawings/_incoming/<project_code>/<uuid>/<file>$` (plus any `bom/` and `bim/` staging namespaces), and check that the caller can see `<project_code>`. Final keys must never be signable.

### F-3 — Same-sheet replace is not atomic; `rev`/`file_name` lack upper bounds (new)
- **Severity:** Low · **OWASP:** API8:2023 (robustness) / A04:2021 Insecure Design
- **Where:** `drawings.service.ts` `create()`, in this order: `putObject(finalKey)`, delete staging, `findMany(same)`, delete the old object and row, then `drawing.create`. `create-drawing.dto.ts` has `rev` with `@Min(0)` but no `@Max`, and `file_name` has no `@Length` (the column is `VarChar(255)`).
- **What:** If `drawing.create` fails after the old rows are deleted (DB hiccup or concurrent replace), the sheet's record is lost. An oversized `rev` (> int4) or a `file_name` over 255 characters passes the DTO, writes the final object, and then hits a Prisma error, which returns a 500 and leaves an orphan object.
- **Fix (route → backend):**
  - Wrap the `findMany`/`delete`/`create` sequence in `prisma.$transaction`, and delete old objects only after it commits.
  - Add `@Max(9999)` to `rev`, matching the UI's `MAX_REV`.
  - Add `@Length(1, 255)` to `file_name`.

### F-4 — Staged objects under `drawings/_incoming/` are never cleaned up on abandon (new)
- **Severity:** Low · **OWASP:** API4:2023
- **Where:** The flow in `src/api/drawings.ts` `uploadDrawing` stages the file before calling `POST /drawings`. The server deletes the staged object only on success or a pdf-lib failure. It does not delete it when `getObject` fails, when `putObject` fails, or when the client never calls `POST`.
- **Why:** Storage grows without limit and the cost lands on the bucket. Combined with F-2, it also gives a free arbitrary-blob store.
- **Fix (route → devops):** Add a GCS lifecycle rule that deletes `drawings/_incoming/**` objects older than 1 day.

### F-5 — Customers can still download superseded revs by key (new semantics, Low)
- **Severity:** Low · **OWASP:** API3:2023 BOPLA
- **Where:** `CustomerScopeInterceptor` `drawingFileKey` checks only that the key is any `drawing` row of the customer's project. It does not check that the row is the current rev.
- **What:** `GET /drawings` hides old revs from customers, but the keys follow a predictable pattern (`.../<mark>/rev<n>/<file>`), so a customer can fetch `rev0`/`rev1` sheets directly. They stay within their own company's project, so nothing crosses tenants.
- **Fix (route → backend, only if old revs are meant to be confidential to customers, which is a product decision for Tao):** In the `drawingFileKey` path, for customers, also require that the row is the current rev for its mark.

### Info
- **I-1. `drawings` is still permission-ungated by design.** It has `JwtAuthGuard` only (wiki `tech/backend/decisions.md#permanently-ungated-modules`, 2026-08-07, carried forward in the Sprint 32 rebuild). Any employee can upload to, replace sheets in, or `DELETE /drawings/:id` from any project or zone. This is accepted risk and not a regression. Re-evaluate if drawings ever need per-department control.
- **I-2. `mime_type` is client-supplied and stored unvalidated.** It currently has no sink. Consider dropping the field or forcing it to `application/pdf` server-side.
- **I-3. Error messages mention `file_key`** although the field is now `upload_key` (cosmetic). Nothing internal is disclosed.
- **I-4. `create()` swallows the `getObject` error into a 400.** This is fine, but nothing is logged, which makes F-1/F-2 abuse invisible (A09:2021). Consider a `warn` log carrying the user id and key.

## Summary table

| # | Sev | Where | Status | Route |
|---|---|---|---|---|
| F-1 | Medium | `drawings.service.ts` create → `a3-normalize.ts` | new | backend |
| F-2 | Medium | `file-storage.controller.ts` presignedUpload | **pre-existing** | security → backend |
| F-3 | Low | `drawings.service.ts` create, `create-drawing.dto.ts` | new | backend |
| F-4 | Low | `_incoming/` staging lifecycle | new | devops |
| F-5 | Low | `customer-scope.interceptor.ts` drawingFileKey | new semantics | backend (product call) |
| I-1..4 | Info | — | — | — |
