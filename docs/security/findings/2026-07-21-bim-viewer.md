# Security Review — BIM Viewer (Sprint 23, Autodesk Forge/APS)

- **Branch:** `dev-t-bim-viewer`
- **Reviewer:** security subagent (review-only)
- **Date:** 2026-07-21
- **Scope:** `backend/prisma/schema.prisma` + 8 new BIM migrations ·
  `backend/src/modules/bim/**` (whole module) · `backend/.env.example` /
  `app.module.ts` / `config/configuration.ts` (APS env vars) ·
  `src/App.tsx` · `src/components/bom/FileDropzone.tsx` ·  `src/index.css` ·
  `src/api/bim.ts` · `src/components/bim/**` · `src/hooks/useBim.ts` ·
  `src/pages/BimViewer.tsx`
- **Verdict: WARN**

---

## F-001 · API1:2023 Broken Object Level Authorization (BOLA/IDOR) — re-confirmed, not new

- **Where:** `backend/src/modules/bim/bim.controller.ts:75,81,87,93` (`getStatus`,
  `retry`, `getElements`, `getViewerToken` — all `@Param('id', ParseIntPipe) id`)
  → `backend/src/modules/bim/bim.service.ts:232-236` (`findOrThrow`)
- **What:** Every `:id`-scoped route resolves the row by primary key only.
  `findOrThrow` does `prisma.bim_model.findUnique({ where: { id } })` with no
  check that the requesting user (or their project) owns/is a member of
  `model.project_id`. Any authenticated user (any valid JWT) can read status,
  elements, and a working APS viewer token for **any** `bim_model` row by ID,
  and can trigger `retry` (re-runs translation, deletes+re-extracts all
  `bim_element` rows) on any model.
- **Why:** Cross-project data disclosure (element geometry/marks/weights/
  properties of a project the user has no business seeing) + cross-project
  state mutation (`retry` wipes and re-extracts another project's element
  data) + `getViewerToken` additionally hands out a live, working APS
  `viewables:read` access_token scoped to the whole APS account, not just
  this urn — so the leaked credential is usable directly against Autodesk's
  API outside our own backend's audit boundary, slightly amplifying the
  usual "read someone else's row" IDOR impact.
- **Re-verification performed (not just re-flagging the prior pass):**
  - Read `bim.controller.ts` and `bim.service.ts` in full — confirmed no
    ownership/membership check exists anywhere in the request path for any
    of the four `:id` routes.
  - Grepped `backend/prisma/schema.prisma` for `project_member`/ACL/
    `access_control` models — **none exist**. There is currently no schema
    primitive in this codebase to even express "user X may access project Y."
  - Independently read `backend/src/modules/bom-upload/bom-upload.controller.ts`
    end to end. Confirmed the **identical** shape on `dispatches/:id`,
    `:id/revisions`, `:id/diff`, `:id/mapping`, `:id/paint-config` (GET and
    POST), `:id/assembly-match` — `@Param('id', ParseIntPipe) id`, zero
    ownership check, gated only by the blanket controller-level
    `@UseGuards(JwtAuthGuard)`. This is a faithful reproduction of the
    established codebase convention, not a new or BIM-specific regression.
  - This exact class of risk is **already tracked** as `R-001` in
    `docs/security/risk-register.md` (Open since 2026-05-29, Impact: High,
    Owner: backend, described as app-wide across `products`, `customers`,
    `dispatches`, `drawings`).
- **OWASP:** API1:2023 (Broken Object Level Authorization)
- **Severity (taxonomy):** High
- **Independent judgment on release gating:** **Do not BLOCK this release on
  F-001.** Recommend the driver treat this as WARN-equivalent, not
  High/BLOCK, specifically for this ship decision, because:
  1. It is not a regression introduced by this feature — it is the
     pre-existing, already-open (`R-001`, 2026-05-29) app-wide pattern,
     faithfully followed. BIM is the *n*-th module to carry it, not the
     first.
  2. `bom-upload`, `drawings`, `work-orders`, `manufacturing-orders`, and
     `customers` all ship today in the identical state. Blocking only BIM
     would not reduce actual exploitability (the same authenticated-user
     population already has this vector across five other modules in
     production) — it would just single out this feature for an
     architecture gap it didn't create and cannot fix unilaterally.
  3. The correct fix — a per-project ACL/membership model — is a
     cross-cutting initiative spanning every module, already surfaced to
     the user as an open architecture decision (per the prior automated
     pass). That decision is pending, not resolved and not rejected. Gating
     ship of one feature on an unrelated, unscoped architecture decision
     that hasn't been made yet would stall indefinitely rather than reduce
     risk.
  4. All current users are internal SSI Steel employees (single-tenant
     deployment, per the trust context already noted for `R-008`) — this
     narrows (does not eliminate) the practical blast radius to
     "any employee can see/touch any other project's BIM/BOM/drawing data,"
     not an internet-exposed attacker.
  - **What this review DOES ask for:** update `R-001`'s fix-path module list
    to include `bim_models` (done below, new cross-reference entry `R-011`
    rather than editing `R-001` directly, per append-only convention), and
    treat this finding as reinforcing evidence that the ACL architecture
    decision is now blocking a second feature — worth re-raising to the
    user directly, outside this review.
- **Fix route:** backend (once the ACL/project-membership architecture
  decision is made — this is not a "add one `if`" fix, it needs a real
  membership model per the prior analysis).

---

## F-002 · API8:2023 Security Misconfiguration — IFC upload has no MIME-type check (extension-only)

- **Where:** `backend/src/modules/bim/bim.controller.ts:60-62`
- **What:** Upload validates only `file.originalname.toLowerCase().endsWith('.ifc')`.
  No check against `file.mimetype` (multer does capture it from the
  `Content-Type` part header, same as `bom-upload`'s `MulterFile.mimetype`).
  An attacker can rename any file to `*.ifc` and it passes this check.
- **Why:** Lower severity than it would look at first glance because the
  file is never written to local disk or served back — `FileInterceptor`
  uses `memoryStorage()`, and `ApsClientService.uploadObject` streams the
  buffer straight to an Autodesk-hosted signed S3 URL
  (`aps-client.service.ts:105-137`). There is no local static-file-serving
  path this could land on, so this is **not** the same path-traversal/
  stored-webshell risk pattern that made the `machines.controller.ts`
  extension gap High (`R-007`). Worst case here is Autodesk's own
  Model Derivative service receiving and rejecting/erroring on a
  non-IFC file, or wasted translation-job cost.
- **OWASP:** API8:2023 (Security Misconfiguration)
- **Severity:** Low
- **Fix route:** backend — add a `mimetype` allow-check (e.g.
  `application/x-step`/`model/ifc`/`text/plain` are all seen in the wild for
  `.ifc`, so this needs a permissive-but-present check, not a strict single
  MIME) mirroring the `bom-upload.service.ts:875` pattern
  (`ALLOWED_MIMES.includes(...) || originalname.match(...)`), for
  defense-in-depth consistency. Not blocking.

---

## F-003 · API3:2023 BOPLA / DTO validation gap — multipart upload body parsed manually, not via DTO (confirmed consistent with existing pattern, not new)

- **Where:** `backend/src/modules/bim/bim.controller.ts:56,64-68`
  (`body['project_id']`, `body['version_choice']` parsed by hand,
  `parseInt`/string-compare, no `class-validator` DTO)
- **What:** `project_id` and `version_choice` are read directly off the raw
  multipart `body` instead of going through a validated DTO class.
- **Why not a new gap:** Verified `bom-upload.controller.ts:75-95` does the
  **exact same thing** for its own multipart upload (`project_id`,
  `zone_id`, `sub_zone_id`, `upload_mode`, `revision_choice` — all manual
  `body['...']` + `parseInt`/string-compare, no DTO). This is the
  established codebase convention specifically for multipart endpoints
  (Nest's `ValidationPipe` binds cleanly to JSON bodies but multer puts
  multipart text fields on `req.body` as plain strings before any DTO
  transform runs cleanly against a file-bearing request) — not a BIM
  regression. Validation *does* happen, just manually
  (`isNaN(projectId)` → 400, `version_choice` whitelisted to
  `'major'|'minor'` via ternary) rather than via decorators.
- **OWASP:** API3:2023 (Broken Object Property Level Authorization) — filed
  under DTO-validation-gap category per role card checklist
- **Severity:** Low / informational
- **Fix route:** backend, app-wide (not BIM-specific) — a shared
  helper/DTO pattern for multipart text fields would be a nice-to-have
  cleanup, not urgent. Not blocking.

---

## Checks performed with clean result (no finding)

- **File upload size cap:** `FileInterceptor('file', { storage:
  memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })`
  (`bim.controller.ts:53`) — 100MB hard cap present and enforced by multer
  itself (throws before the handler runs on oversize). Frontend
  `BimUploadModal.tsx` mirrors it (`MAX_IFC_SIZE = 100_000_000`) for UX only
  — backend is the real enforcement point. Confirmed.
- **Path traversal / injection via `objectKey`:**
  `` `${Date.now()}-${file.originalname}`.replace(/[^\w.\-]/g, '_')``
  (`bim.service.ts:51`) strips every character except word chars/dot/dash —
  `/`, `\`, and `..`-as-a-traversal-primitive cannot survive (any `/` or `\`
  becomes `_`). The sanitized key is also never used as a local filesystem
  path (memoryStorage → direct-to-APS upload) and is `encodeURIComponent`'d
  again before being placed in the APS OSS URL path
  (`aps-client.service.ts:110,124`). No traversal or header-injection risk.
- **APS credential handling:** `APS_CLIENT_ID`/`APS_CLIENT_SECRET`
  (`aps-client.service.ts:30-46`) are read from `process.env` only, used
  once to build a Basic-auth header for the token endpoint, never logged,
  never included in any thrown error message, never returned in any API
  response. `backend/.env.example` ships both as empty placeholders (no
  real secret committed). Grepped the whole `bim/` module for
  `password|secret|key|credential|DATABASE_URL` — the only matches are the
  env-var names themselves and unrelated JS object key-lookups in
  `property-extractor.ts` (`Object.keys(...).find(...)`) — clean.
- **`getViewerAccessToken` scoping:** confirmed genuinely least-privilege —
  it requests a **separately-cached** token with `viewables:read` only
  (`VIEWER_SCOPES`), distinct from the broad `SERVER_SCOPES` (`data:read
  data:write data:create bucket:create bucket:read`) token used for
  server-side upload/translate calls, which is never returned to any
  endpoint. Expiry is Autodesk's own `expires_in` minus a 60s safety margin
  (2-legged OAuth tokens are typically ~1h) — appropriately short-lived,
  this is Autodesk's standard token lifetime, not something BDT controls
  further. Frontend caches it client-side for 50 min
  (`useBim.ts:69`, comment confirms the ~1h assumption) — consistent.
  Well-implemented control; no finding.
- **SSRF:** `AUTH_URL`/`OSS_URL`/`MD_URL` in `aps-client.service.ts:3-5` are
  hardcoded constants. The only dynamic path segments are `bucketKey`
  (server env var, not user input), `objectKey` (sanitized + encoded, see
  above), and `urn` (server-generated — base64 of an object id APS itself
  returned to us; never accepted as raw user input on any endpoint). No
  outbound URL is built from unsanitized user-controlled input.
- **SQL injection / raw queries:** grepped `bim.service.ts` and
  `property-extractor.ts` for `queryRaw` — zero matches. Every DB access in
  the module goes through typed Prisma ORM calls (`findMany`, `findFirst`,
  `findUnique`, `findUniqueOrThrow`, `create`, `createMany`, `update`,
  `updateMany`). `property-extractor.ts` does no DB access at all — pure
  JS transform of the APS properties response.
- **`FileDropzone.tsx` `maxSizeBytes` change does not weaken BOM upload:**
  confirmed via grep across all call sites
  (`UpdateBomModal.tsx`, `BomUpload.tsx`, `CuttingPlanUpload.tsx`,
  `BimUploadModal.tsx`) — the new `maxSizeBytes` prop defaults to the
  unchanged `MAX_SIZE_BYTES = 20_000_000` constant, and **no BOM or
  cutting-plan call site passes the prop** (they all fall through to the
  default). Only `BimUploadModal.tsx` opts in with `MAX_IFC_SIZE =
  100_000_000`. BOM's own client-side cap is unaffected; the backend
  (`bom-upload.controller.ts:62`, `fileSize: 20 * 1024 * 1024`) is the real
  enforcement boundary regardless and is untouched by this diff.
- **DTO validation on query params:** `QueryBimModelsDto` /
  `QueryLatestBimVersionDto` both use `class-validator`
  (`@IsInt`, `@Min(1)`, `@Transform`) and are picked up by the global
  `ValidationPipe({ whitelist: true, transform: true })` registered in
  `backend/src/main.ts:10-11` — confirmed active app-wide, not bypassed for
  this module.
- **Env var wiring:** `configuration.ts` adds `APS_CLIENT_ID`/
  `APS_CLIENT_SECRET`/`APS_BUCKET_KEY` as `@IsOptional() @IsString()` —
  consistent with the existing `CUTTING_PLAN_API_URL` pattern; module fails
  loud at first real APS call (`requireCredentials()`) rather than silently
  if unset, not at boot. No hardcoded credential anywhere in
  `app.module.ts` / `configuration.ts` / `.env.example`.

## Observation (not a finding — cross-reference to already-tracked risk)

- **Resource consumption:** the 100MB `memoryStorage()` cap
  (`bim.controller.ts:53`) is 5x `bom-upload`'s 20MB cap, and there is still
  no rate limiting on any upload endpoint app-wide. This doesn't introduce a
  new risk class — it's an amplification of the already-Open `R-003`
  (API4:2023, no rate limiting). No new register entry needed; noting for
  awareness only.

---

## Risk register updates

- Appended **`R-011`** to `docs/security/risk-register.md` — cross-references
  `R-001` and adds `bim_model`/`bim-models` to its affected-module list
  (append-only; `R-001` itself left untouched per convention).

## Files reviewed

`backend/prisma/schema.prisma` (bim_model/bim_element sections) ·
`backend/prisma/migrations/{20260720061904,20260720072002,20260720081310,
20260720082252,20260720103000,20260721090000,20260721100000,20260721110000}*`
· `backend/src/modules/bim/{bim.controller.ts,bim.service.ts,
aps-client.service.ts,property-extractor.ts,bim.module.ts,
dto/query-bim-models.dto.ts,dto/query-latest-bim-version.dto.ts}` ·
`backend/.env.example` · `backend/src/app.module.ts` ·
`backend/src/config/configuration.ts` · `backend/src/main.ts` (ValidationPipe
check) · `src/App.tsx` · `src/components/bom/FileDropzone.tsx` (+ all 4 call
sites) · `src/api/bim.ts` · `src/hooks/useBim.ts` · `src/pages/BimViewer.tsx` ·
`src/components/bim/BimUploadModal.tsx` · `src/components/bim/BimViewport.tsx`
(console usage check) · comparison reference:
`backend/src/modules/bom-upload/bom-upload.controller.ts`,
`bom-upload.service.ts` (lines 21-40, 873-876).

## Status

DONE.
