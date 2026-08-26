# Security Review — Drawing DWG APS 2D Preview (fire-and-forget GCS→APS push)

- **Branch under review:** `dev` (5 commits ahead of `staging`: `5e8a81b`
  reserve Drawing's bucket key / move BIM to JPN bucket, `fbb21e5` DB
  migration for APS preview tracking columns, `768ca37` extract
  `ApsClientService` into shared `aps` module, `4cf6fcd` DWG APS 2D-preview
  backend, `57caae3` DWG-only preview + removal of DXF/PDF/PNG/JPG preview
  path) — PR #132 not yet merged, per merge commit `2d863eb` (PR #131) already
  landed on `origin/dev`.
- **Reviewer:** security subagent (review-only), via `/release-gate`
- **Date:** 2026-08-26
- **Scope:** `git diff origin/staging..origin/dev -- backend/src/ src/` (20
  files) — `backend/src/modules/aps/**` (new, extracted from `bim/`),
  `backend/src/modules/bim/{aps-client.service.ts→moved,bim-backup.service.ts,
  bim.module.ts,bim.service.ts,property-extractor.ts}` (import-path-only
  churn from the extraction), `backend/src/modules/drawings/{drawing-aps.
  service.ts,drawing-aps.service.spec.ts,drawings.controller.ts,drawings.
  module.ts,drawings.service.ts,drawings.service.spec.ts}`,
  `backend/src/config/configuration.ts`, `backend/prisma/schema.prisma` +
  migration, `src/api/drawings.ts`, `src/components/drawings/
  {DrawingApsPreview.tsx(new),DrawingPreviewPanel.tsx,DrawingUploadModal.tsx,
  DxfPreview.tsx(removed)}`, `src/hooks/useDrawings.ts`,
  `src/types/dxf-viewer.d.ts (removed)`. Also read (unchanged by this diff,
  load-bearing for the questions below): `backend/src/modules/drawings/dto/
  create-drawing.dto.ts`, `backend/src/modules/file-storage/{file-storage.
  service.ts,drivers/gcs.driver.ts}`, `backend/src/modules/bim/bim.controller.
  ts`, `backend/src/common/guards/permission.guard.ts`,
  `.github/workflows/deploy-backend.yml`, `backend/.env.example`,
  `docs/security/risk-register.md` (R-001, R-011).
- **Verdict: WARN**

---

## DoD checklist

| Check | Result |
|---|---|
| `JwtAuthGuard` on all endpoints | ✅ present at class level on `DrawingsController` (unchanged decorator, `drawings.controller.ts:14`); both new routes inherit it. No `PermissionGuard`/`@RequiresPermission` anywhere in this module (was already true pre-diff for `POST`/`GET`/`DELETE` too — see F-001). |
| DTO validation on new input | N/A — both new endpoints take only `@Param('id', ParseIntPipe) id`, no body/query DTO to validate. `ParseIntPipe` rejects non-numeric `:id` with 400 before the handler runs. |
| Grep clean: `password\|secret\|credential` | ✅ zero real matches across the full diff — only `requireCredentials()` (a method name, pre-existing) and `APS_CLIENT_SECRET` (an env-var *name* being read via `process.env`, never its value logged/returned/thrown). See "Clean checks" below for the full trace. |
| File upload: size + MIME + extension | ⚠️ See F-002 — client-side extension allowlist tightened to `.dwg` only; server-side `file_key` path-shape regex is unchanged and was never extension-aware (pre-existing, not touched by this increment). |
| No SQL string concat / `$queryRaw` | ✅ N/A — `DrawingApsService` and the touched `drawings.service.ts` use only `prisma.drawing.{findUniqueOrThrow,update,create}` (typed Prisma calls). Migration is a static hand-written `ALTER TABLE` (3 nullable columns), no request input. |
| Audit trail | N/A — no new state-changing business flow exposed to the client; `pushToAps`/`checkStatus` mutate only the `aps_urn`/`aps_translation_status`/`aps_translation_error` columns on the same drawing row, driven by the server's own async pipeline, not by user-supplied data. |

---

## F-001 · API1:2023 Broken Object Level Authorization (BOLA/IDOR) — re-confirmed, not new, and narrower in kind than the existing `R-011` framing implies

- **Where:** `backend/src/modules/drawings/drawings.controller.ts:52-61`
  (`getApsStatus`, `getApsViewerToken`, both bare
  `@Param('id', ParseIntPipe) id`) → `DrawingApsService.checkStatus()` /
  `.getViewerToken()` (`drawing-aps.service.ts:88,133`), both
  `prisma.drawing.findUniqueOrThrow({ where: { id } })` with no ownership
  check.
- **What:** Any authenticated user (any valid JWT) can poll translation
  status and fetch a working APS viewer token + urn for **any** `drawing`
  row by ID, regardless of which project/zone it belongs to.
- **Why:** Cross-project disclosure — the `access_token` returned by
  `getApsViewerToken` is a real, usable (if narrowly `viewables:read`-scoped,
  see clean-check below) Autodesk credential the caller can present directly
  to Autodesk's own API to load the 2D geometry of a drawing they may have no
  business seeing, outside this backend's own audit boundary.
- **Is this a NEW gap or the existing app-wide pattern?** Verified directly,
  not assumed:
  1. **This module's own precedent:** `DELETE /drawings/:id`
     (`drawings.controller.ts`, present since before this diff, confirmed via
     `git show origin/staging:.../drawings.controller.ts`) already resolves
     by bare `id` with zero ownership check — this increment adds two
     *read*-only endpoints in the identical shape to an already-shipped
     *destructive* one on the same controller.
  2. **`R-001`** (`docs/security/risk-register.md`, Open since 2026-05-29)
     already names `drawings` explicitly in its affected-module list
     ("`products`, `customers`, `dispatches`, `drawings`") — this is not a
     new module joining the pattern, it's the *same* module's existing
     tracked risk surfacing on two more routes.
  3. **`R-011`**'s BIM precedent is structurally identical, and I re-verified
     the guard claim rather than trusting the task framing at face value:
     `bim.controller.ts`'s class-level guard is actually
     `@UseGuards(JwtAuthGuard, PermissionGuard)` (two guards, not one as a
     surface read might suggest) — but `PermissionGuard.canActivate()`
     (`common/guards/permission.guard.ts:14`) does `if (!requirement) return
     true`, i.e. it's a pure no-op on any handler lacking a
     `@RequiresPermission()` decorator. `getStatus` and `getViewerToken` on
     `bim.controller.ts` carry no such decorator (confirmed by reading the
     full file) — so in practice BIM's `:id/status` and `:id/viewer-token`
     enforce exactly `JwtAuthGuard` and nothing else, same as Drawing's new
     routes. `R-011` was reviewed as release-gate **WARN, not BLOCK**, for
     that exact shape on 2026-07-21, explicitly because it's "pre-existing
     app-wide convention (not a regression)".
  4. **No schema primitive exists** to express per-project/zone access
     control anywhere in this codebase (`grep`'d `schema.prisma` for
     `project_member`/ACL/`access_control` — none) — same conclusion as the
     2026-07-21 and 2026-08-25 reviews reached independently for BIM and for
     Drawing's own zone-scoped list/latest-version endpoints.
- **OWASP:** API1:2023 (Broken Object Level Authorization)
- **Severity (taxonomy):** High
- **Release-gating judgment:** **Do not BLOCK on F-001.** Same reasoning
  `R-011` already established for BIM, restated for this increment:
  not a regression (this module's `DELETE :id` already had zero ownership
  check before this diff even existed), not novel (five-plus modules ship
  identically today per `R-001`/`R-011`), fix is a cross-cutting
  project/zone-membership model that hasn't been decided yet, and all
  current users are internal SSI Steel employees (single-tenant deployment).
  Treat as WARN.
- **Fix route:** backend — once the project/zone-membership ACL decision
  lands (per `R-001`'s fix path), apply it to `drawings` (already listed)
  including these two new routes. No separate BIM- or Drawing-specific fix
  should be built in isolation, per `R-011`'s own guidance.
- **Risk register:** no new entry needed — `drawings` is already an
  `R-001`-listed module and this is the same primitive resurfacing, not a new
  risk class. Not appending a redundant entry per append-only convention
  (each new entry should represent a new risk class, and this one doesn't).

---

## F-002 · API8:2023 Security Misconfiguration — DWG-only restriction is client-side UX, not a server-side control (pre-existing, not a regression, informational)

- **Where:** `src/components/drawings/DrawingUploadModal.tsx:5`
  (`DRAWING_FORMATS = ['.dwg']`, tightened from `['.pdf', '.dwg', '.dxf',
  '.png', '.jpg', '.jpeg']` by this diff) vs.
  `backend/src/modules/drawings/dto/create-drawing.dto.ts:22-27`
  (`file_key` `@Matches(/^drawings\/[^/\\]+\/[^/\\]+\/(?:[^/\\]+\/)?v\d+\/
  [^/\\]+$/)`, `file_name` `@IsString()` only).
- **What:** Confirmed via `git diff origin/staging..origin/dev --
  backend/src/modules/drawings/dto/create-drawing.dto.ts` (empty diff) —
  **this regex predates the increment and is untouched by it.** It validates
  only the *path structure* (project/zone/[sub-zone]/version/filename
  segment shape, the anti-traversal control reviewed in depth by
  `2026-08-25-drawing-zone-scope.md` F-01) — it has never constrained the
  file *extension*. Nothing server-side stops a client from POSTing
  `file_key: 'drawings/P/Z/v1/malicious.exe'` today, same as before this
  diff. The actual file bytes never transit this backend either (confirmed
  `uploadDrawing()` in `src/api/drawings.ts` — presigned-upload direct to
  GCS, same pattern as BIM's direct-to-APS upload), so this is a DTO-layer
  gap, not a multer/fileFilter gap.
- **Why:** Per the role card's own heuristic ("client-side restriction alone
  isn't a security control") the new `.dwg`-only client restriction adds no
  real enforcement — an attacker (or a buggy future caller) can still submit
  any extension via the DTO today, exactly as they could pre-increment.
  Impact is bounded: (1) this is API-only, gated by `JwtAuthGuard` (internal
  authenticated users only, per the single-tenant trust context noted
  elsewhere in this register); (2) the extension-mismatch consequence is
  currently just a wasted/failed `DrawingApsService.pushToAps()` attempt
  (only `.dwg`-suffixed `file_name`s trigger the push at all —
  `drawings.service.ts:35`, confirmed case-insensitive per the new spec
  tests) — no local-disk write, no code execution path; (3) GCS (the active
  staging/prod driver) doesn't execute or interpret stored objects.
- **OWASP:** API8:2023 (Security Misconfiguration) — filed adjacent to the
  role card's file-upload-3-checks heuristic, though this is DTO validation
  rather than a multer `fileFilter`.
- **Severity:** Low — pre-existing, not worsened or introduced by this
  increment (the client tightening is strictly a UX narrowing, not a new
  hole; the server-side gap was identical before and after this diff).
- **Fix route:** backend (optional hardening, not urgent, not blocking this
  release) — add an extension check to `CreateDrawingDto.file_key`/
  `file_name` (or in `DrawingsService.create()` alongside the existing
  `.toLowerCase().endsWith('.dwg')` check, gating the whole row rather than
  just the APS push) if Drawing is meant to be DWG-only end-to-end, not just
  in the UI. Not filed as a new risk-register entry — same class as `R-007`
  (extension-only, MIME-optional upload gaps elsewhere in the app) but this
  case doesn't even have the extension check server-side, so if formalized
  it should be its own line item; deferring to backend's judgment on whether
  it's worth a dedicated entry given the bounded impact above.

---

## Clean checks performed (no finding)

- **Credential wiring (`APS_CLIENT_ID`/`APS_CLIENT_SECRET`):** unchanged by
  this diff. `.github/workflows/deploy-backend.yml:58-59` still wires both
  via `--set-secrets` (`staging-bdt-engineering-aps-client-id`/`-secret`),
  never `--set-env-vars`. Confirmed still read only from `process.env` in
  `aps-client.service.ts`, used once each to build a Basic-auth header,
  never logged, never returned in any response, never included in a thrown
  error message (checked every `throw` site in `aps-client.service.ts` —
  all interpolate only HTTP status codes and small API-provided diagnostic
  strings, never headers/URLs/tokens).
- **New env vars are bucket names, not secrets, and are treated as such
  everywhere:** `APS_BIM_BUCKET_KEY`/`APS_DRAWING_BUCKET_KEY`
  (`configuration.ts:48-53`, `@IsOptional() @IsString()`) are wired via
  `--set-env-vars` in `deploy-backend.yml:65-66` (`bdt-bim-staging` /
  `bdt-drawing-staging` — plain bucket names, not credentials) and default
  to non-secret literal fallbacks (`'bdt-bim-dev'`/`'bdt-drawing-dev'`) in
  `aps-client.service.ts`. Correct classification in both directions:
  real secrets (`APS_CLIENT_ID`/`_SECRET`) stayed on `--set-secrets`, and the
  new non-secret bucket-name vars didn't get incorrectly promoted to
  `--set-secrets` either (which would just be noise/over-restriction, not a
  vulnerability, but confirming it wasn't done).
- **Viewer token scope preserved (not the broad server token):**
  `DrawingApsService.getViewerToken()` (`drawing-aps.service.ts:133-137`)
  calls `this.aps.getViewerAccessToken()`, which requests
  `VIEWER_SCOPES = 'viewables:read'` only (`aps-client.service.ts:13,75-82`)
  — a separately-cached token, distinct from `getAccessToken()`'s
  `SERVER_SCOPES = 'data:read data:write data:create bucket:create
  bucket:read'` used for all server-to-server bucket/upload/translate calls
  (including `pushToAps()`'s own `ensureBucket`/`createSignedUpload`/
  `completeUpload`/`translate` calls, which correctly stay server-side and
  are never returned to any endpoint). Confirmed no code path in the diff
  returns the broad-scope token to `getViewerToken()`'s caller.
- **`pushToAps()`'s URL construction — no user input reaches an outbound
  URL:** `downloadUrl` (from `fileStorage.getDownloadUrl(fileKey)`) is
  minted by the GCS SDK's own `bucket.file(key).getSignedUrl({...})`
  (`gcs.driver.ts:31-38`) — `fetch(downloadUrl)` calls Google's signed URL,
  not anything request-supplied. `url` (from `aps.createSignedUpload(...)`)
  is minted by Autodesk's own `/signeds3upload` endpoint response — the
  subsequent `fetch(url, { method: 'PUT', ... })` calls Autodesk's URL, not
  anything request-supplied either. Neither signed URL is user-controlled;
  both come from trusted first-party APIs server-side. No SSRF vector.
- **`objectKey` construction — no injection risk:**
  `` `${Date.now()}-${fileName}`.replace(/[^\w.\-]/g, '_')``
  (`drawing-aps.service.ts:47`) strips every character except word
  chars/dot/dash before the value is used — `fileName` originates from
  `CreateDrawingDto.file_name` (`@IsString()`, no format restriction, so in
  principle attacker-influenceable), but the `.replace()` neutralizes any
  `/`, `\`, `..`, or header/URL-injection-relevant character regardless of
  what the DTO allowed through. The sanitized value is also
  `encodeURIComponent()`'d again downstream in
  `ApsClientService.createSignedUpload()`/`completeUpload()` before being
  placed in the APS OSS URL path — defense in depth, matches the identical,
  already-clean pattern `2026-07-21-bim-viewer.md` confirmed for
  `bim.service.ts`'s equivalent `objectKey` construction (same regex,
  same double-sanitization shape).
- **Log-leak grep across the full diff:** `password|secret|key|credential`
  — only real matches are `requireCredentials()` (method name) and
  `APS_CLIENT_SECRET` (env-var name in a getter, never its value). Manually
  traced every `logger.error`/`this.logger` call added by this diff — just
  one, in `DrawingApsService.pushToAps()`'s catch block
  (`drawing-aps.service.ts:75-79`): logs `drawingId` and `fileKey` (an
  internal GCS object path, not a credential) in the message, and
  `err.stack` for the error detail. Traced every `throw` this catch could
  receive (own `new Error(...)` calls in `pushToAps()`, plus every
  `ApsClientService` method it calls) — none of them ever interpolate a
  full URL (signed or otherwise) into an error message; all interpolate only
  HTTP status codes and short API-provided diagnostic strings. No
  signed-URL query-string token (GCS `X-Goog-Signature=...` / APS upload
  token) can reach the logs via this path.
- **DTO/`ParseIntPipe` on the new routes:** both new endpoints take only
  `id: number` via `@Param('id', ParseIntPipe)` — malformed/non-numeric
  `:id` is rejected with 400 before either handler body runs. No
  request-body or query surface to validate.
- **SQL injection / raw queries:** grepped `drawing-aps.service.ts` and the
  touched portions of `drawings.service.ts` for `queryRaw` — zero matches;
  every DB access goes through typed Prisma calls
  (`findUniqueOrThrow`, `update`, `create`).
- **Migration safety:** `20260826100553_add_aps_preview_to_drawing/
  migration.sql` is a static 3-line `ALTER TABLE` adding nullable
  `aps_urn VARCHAR(200)` / `aps_translation_status VARCHAR(20)` /
  `aps_translation_error TEXT` — no string interpolation, no request input,
  no data loss (additive, nullable columns only).
- **Fire-and-forget failure isolation:** `pushToAps()`'s outer `try/catch`
  ensures a preview-generation failure can never throw out of the
  fire-and-forget call in `drawings.service.ts:36` and can never fail the
  primary GCS-upload response — confirmed by the dedicated spec coverage in
  `drawing-aps.service.spec.ts` (GCS-fetch-fails, APS-PUT-fails,
  `ensureBucket`-rejects cases all assert `resolves.toBeUndefined()`), which
  is a reliability property but also indirectly a security-relevant one
  (an attacker can't use a malformed/oversized DWG to trigger an unhandled
  rejection or crash the request handler).

---

## Observation (not a finding — out of scope of this diff, noted for awareness)

- `POST /file-storage/presigned-upload` (`file-storage.controller.ts:31-42`,
  entirely unchanged by this diff — pre-existing generic infra shared by
  BIM/Drawing/BOM uploads) accepts `{ key, contentType }` with no visible
  extension/MIME allowlist at that layer either. This is not part of the
  Drawing-APS-preview feature surface and predates it; noting only because
  investigating F-002 surfaced it. Not filed as a finding against this
  review (out of scope) and not blocking.

---

## Risk register updates

None. Both findings resurface already-tracked risk classes:

- F-001 is the same primitive as `R-001` (which already lists `drawings`)
  and `R-011` (BIM's identical shape, already WARN'd, not BLOCK'd, for the
  same reasoning restated here).
- F-002 is a Low/pre-existing DTO-validation gap, not touched or worsened by
  this increment — left to backend's judgment whether it warrants its own
  register entry (recommend not, given bounded impact, but not this role's
  call to force one either way).

## Files reviewed

`backend/src/modules/aps/{aps-client.service.ts,aps.module.ts}` ·
`backend/src/modules/bim/{bim.module.ts,bim.service.ts,bim-backup.service.ts,
property-extractor.ts,bim.controller.ts}` (import-path diff + guard
comparison) · `backend/src/modules/drawings/{drawing-aps.service.ts,
drawing-aps.service.spec.ts,drawings.controller.ts,drawings.module.ts,
drawings.service.ts,drawings.service.spec.ts,dto/create-drawing.dto.ts}` ·
`backend/src/config/configuration.ts` · `backend/prisma/schema.prisma` +
`migrations/20260826100553_add_aps_preview_to_drawing/migration.sql` ·
`backend/src/common/guards/permission.guard.ts` +
`decorators/permission.decorator.ts` · `backend/src/modules/file-storage/
{file-storage.service.ts,drivers/gcs.driver.ts,file-storage.controller.ts}`
(getDownloadUrl / presigned-upload trace) · `src/api/drawings.ts` ·
`src/components/drawings/{DrawingApsPreview.tsx,DrawingPreviewPanel.tsx,
DrawingUploadModal.tsx}` · `src/hooks/useDrawings.ts` ·
`.github/workflows/deploy-backend.yml` · `backend/.env.example` ·
`docs/security/risk-register.md` (R-001, R-011) · comparison references:
`docs/security/findings/{2026-07-21-bim-viewer.md,
2026-08-25-drawing-zone-scope.md}`.

## Status

DONE.
