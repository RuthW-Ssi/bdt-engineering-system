# Security Findings — Drawing Project-scope rework + GCS backup + DXF preview/tools

Branch: `dev-t-drawing-rebuild` · Reviewed: 2026-08-24 · Reviewer: main agent (direct review — `security` subagent type unavailable in this session; performed against `wiki/tech/roles/security.md`'s exact checklist/conventions instead of skipping the gate)

## Scope reviewed

`git diff main` for: `backend/prisma/schema.prisma` + migration, `backend/src/modules/bim/{aps-client.service.ts,bim.module.ts,bim.service.ts,bim-backup.service.ts}`, `backend/src/modules/bom-upload/bom-upload.service.ts`, `backend/src/modules/drawings/**`, `backend/src/modules/file-storage/**`, `src/api/{drawings,file-storage}.ts`, `src/components/drawings/**`, `src/hooks/useDrawings.ts`, `src/pages/DrawingList.tsx`.

## DoD checklist

| Check | Result |
|---|---|
| All POST/PATCH/DELETE endpoints have `JwtAuthGuard` | ✅ — `drawings.controller.ts` and `file-storage.controller.ts` both `@UseGuards(JwtAuthGuard)` at class level; confirmed by reading both files directly. |
| DTO validation present on every input | ⚠️ Partial — `create-drawing.dto.ts` has full `class-validator` coverage (all 5 fields, including a tightened `file_key` regex). `file-storage.controller.ts`'s `presigned-upload` and `download` endpoints take raw `{key, contentType}` / `?key=` with **no DTO class at all** — see F-01. |
| Grep clean: `password\|secret\|key\|credential\|DATABASE_URL` | ✅ — all matches are legitimate `process.env.*` reads into local variables; no hardcoded values, no logging of the raw credential/secret values found anywhere in the diff. |
| File upload: size + MIME + extension checks | N/A for this diff — Drawing uploads now go through presigned GCS PUT (client → GCS directly) or the pre-existing local-driver multer path; no new upload-size/MIME logic was added or changed here. `bom-upload.service.ts`'s existing checks (50MB/MIME/`.xlsx`) are unchanged by this diff (only its storage key + `putObject` call changed). |
| No SQL string concat in `$queryRaw` | ✅ — no `$queryRaw`/`$queryRawUnsafe` usage anywhere in this diff. |
| Audit trail for state changes | N/A — no new state-changing business-rule flow introduced (file storage backend swap + a new join table are infrastructure, not audited business state per this app's existing convention). |

## Findings

### F-01 — `presigned-upload` / `download` have no per-key authorization or format scoping (new/widened by this diff)
- **where:** `backend/src/modules/file-storage/file-storage.controller.ts:31-70` (`presignedUpload`, `download`), backing service `file-storage.service.ts:34-40` (`getUploadUrl`/`getDownloadUrl` pass `key` straight to the driver, zero validation)
- **what:** Both endpoints require only a valid JWT (any authenticated user) and accept an arbitrary `key: string` with no format restriction, no DTO/`class-validator`, and no check that the key's project/module prefix belongs to the caller. On the GCS driver, `presigned-upload` mints a real signed PUT URL for **any** key in the bucket — an authenticated user could request a signed URL for e.g. another project's `bom/<other_project>/...` or `drawings/<other_project>/...` path and overwrite it; `download` similarly mints a signed GET for any key, or serves any local-disk path already inside the storage root. This is materially wider than the pre-existing pattern because it's a **write** path (arbitrary overwrite), not just read.
- **why it's not new architecture, but is a new instance:** `drawings.controller.ts`'s own `CreateDrawingDto.file_key` DOES enforce a strict regex (`drawings/<project_code>/v<n>/<filename>`) — but that only validates the DB *record*, after the file is already sitting in GCS at whatever key the client asked `presigned-upload` for. The regex on the DTO does not constrain what `presigned-upload` will sign a URL for; the two are independent code paths.
- **severity:** Medium — calibrated against this repo's own established baseline (per `docs/security/findings/2026-07-21-bim-viewer.md` F-06 and its cross-reference to risk `R-011`): this app has **no per-project authorization anywhere yet** (any authenticated internal user can already act on any project's data via the identical any-JWT-holder pattern in `bom-upload`, `drawings`, `work-orders`, `manufacturing-orders`, `customers`, and now `bim` controllers — confirmed pattern, not unique to this diff). Given the app's accepted risk model is "internal-engineer-only tool, systemic gap, tracked not fixed per-module," this is scored consistent with that baseline rather than as a novel Critical — but flagged explicitly because it is a **write**, not read, capability, which is a real step up in blast radius (arbitrary file overwrite vs. arbitrary file read) and deserves its own tracked line rather than silently folding into R-011.
- **fix_route:** security (own the cross-module authorization pattern decision — same recommendation as bim-viewer F-06: don't bespoke-fix this one endpoint, decide the pattern once) / backend (implement once decided). Minimal near-term mitigation worth considering even before full RBAC: restrict `presigned-upload`'s accepted `key` prefixes to the known module namespaces (`drawings/`, `bom/`, `bim/`) via a shared regex, closing the "write literally anywhere in the bucket" edge even without solving per-project scoping.

### F-02 — Known, already-documented local-disk traversal gap (confirmed unchanged, not new)
- **where:** `backend/src/modules/file-storage/file-storage.controller.ts`'s `upload` endpoint (multer `diskStorage`, builds destination from raw `?key=` with `path.join`/`path.dirname`, no `startsWith(storageRoot)` guard — unlike its `download` sibling, which does have that guard).
- **what:** This is the exact gap already documented in `wiki/features/drawing.md`'s "Known residual gap" callout, flagged during the original Sprint 32 build. Confirmed still present and unchanged by this diff — this diff did not touch the `upload` endpoint's multer config at all, only added the `driverType() !== 'local'` guard in front of it (which narrows exposure: this endpoint is now unreachable at all when `FILE_STORAGE_DRIVER=gcs`, i.e. staging/prod).
- **severity:** Not re-scored here — already tracked, out of scope for this diff per its own original constraints. Noting only that the new `driverType()` guard is a net risk *reduction* (the endpoint is dead code on any GCS-backed environment), not a regression.
- **fix_route:** (unchanged) shared key-sanitizer applied to both `upload` and `download`, per the original wiki note.

### F-03 — GCS credential handling (checked, clean)
- **where:** `backend/src/modules/file-storage/drivers/gcs.driver.ts:14-18`, `backend/src/modules/bim/bim-backup.service.ts:21-27`
- **what:** `FILE_STORAGE_GCS_CREDENTIALS_JSON` is read from `process.env` and passed to `new Storage({credentials: JSON.parse(...)})` in both places. Checked: no `console.log`/logger call anywhere in either file prints the raw env var, the parsed object, or the `Storage` instance. If `JSON.parse` throws on malformed input, V8's `SyntaxError` message does not include the input string, so no leak via error message either. `bim-backup.service.ts`'s `bucket()` call (which can throw here) is correctly inside the method's outer `try/catch` — confirmed the earlier same-session fix for the fire-and-forget-unhandled-rejection bug is intact; re-ran `bim-backup.service.spec.ts` (4/4 pass) including the explicit "never rejects" tests.
- **severity:** N/A — no finding, documented as a checked-clean item per role card conventions (findings file should show what was checked, not just what failed).

## Verdict: **WARN**

One Medium finding (F-01), no Critical/High. F-02 is a confirmed-unchanged pre-existing gap already tracked in the wiki, not a new issue from this diff. F-03 confirms clean credential handling. Per protocol, WARN requires explicit user confirmation before shipping — QA's parallel review (`docs/qa/findings/2026-08-24-drawing-gcs-dxf.md`) also returned WARN, no Critical/High there either.

## fix_route summary

| Finding | Severity | fix_route |
|---|---|---|
| F-01 No per-key authz/format scoping on presigned-upload/download | Medium | security (pattern decision) → backend (implement) |
| F-02 Local-disk upload traversal (pre-existing, confirmed unchanged) | (tracked, not re-scored) | devops/backend (unchanged recommendation) |
| F-03 GCS credential handling | N/A (clean) | — |
