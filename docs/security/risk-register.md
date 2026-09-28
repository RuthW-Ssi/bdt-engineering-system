# Risk Register

> Append-only log of known security/compliance risks. Each entry has a stable
> ID (R-###). Status transitions allowed: `Open → Mitigated`, `Open → Accepted`.
> Never delete or reorder entries — superseded risks get a closing note and
> stay in place.
>
> Owner = the role that takes the fix (per role cards in `wiki/tech/roles/`).
> OWASP categories use API Top 10 2023 codes (`API#:2023`) or Web Top 10 2021
> codes (`A##:2021`).

---

## Open risks

### R-001 · API1:2023 BOLA — no object-level authorization

- **OWASP:** API1:2023 (Broken Object Level Authorization)
- **Impact:** High — any authenticated user can read any product, customer,
  BOM dispatch (no owner/project scope check on read endpoints)
- **Likelihood:** High — no checks currently exist
- **Owner:** backend
- **Fix path:** add owner / project-scope check on read endpoints
  (`products`, `customers`, `dispatches`, `drawings`); inject `req.user` →
  filter `where: { project: { user_id: ... } }` or equivalent
- **Status:** Open
- **Created:** 2026-05-29 (initial review)

### R-002 · API3:2023 BOPLA — full Prisma object leak on some endpoints

- **OWASP:** API3:2023 (Broken Object Property Level Authorization)
- **Impact:** Medium — some endpoints return raw Prisma objects with all
  relations included; risks leaking properties the client should not see
  (audit fields, related entities)
- **Likelihood:** Medium — depends on which endpoint
- **Owner:** backend
- **Fix path:** map every response through a DTO (`<Entity>ResponseDto`)
  before returning; never `return prismaResult` directly from controller
- **Status:** Open
- **Created:** 2026-05-29

### R-003 · API4:2023 Unrestricted Resource Consumption — no rate limiting

- **OWASP:** API4:2023 (Unrestricted Resource Consumption)
- **Impact:** Medium — auth endpoints vulnerable to brute force; upload
  endpoints can be flooded; Cloud Run can scale out at cost
- **Likelihood:** Medium — Cloud Run absorbs some load via autoscale, but no
  per-IP or per-user rate limit
- **Owner:** backend (rate-limit middleware) + devops (Cloud Run config)
- **Fix path:** add `@nestjs/throttler` (or equivalent) on `/auth/login`,
  `/bom/upload`, `/file-storage/*`; set per-IP limits at gateway
- **Status:** Open
- **Created:** 2026-05-29

### R-004 · API5:2023 Broken Function Level Authz — no RBAC

- **OWASP:** API5:2023 (Broken Function Level Authorization)
- **Impact:** High — every authenticated user is implicitly admin; no
  admin / user / read-only separation
- **Likelihood:** High — no role gating in any controller
- **Owner:** backend
- **Fix path:** introduce role enum + `@Roles()` guard; gate admin endpoints
  (workflows, deletes, bulk operations); landing in Sprint 10 (ECO workflow)
- **Status:** Open — planned Sprint 10
- **Created:** 2026-05-29
- **Note:** until then, every endpoint = admin-only by default

### R-005 · API6:2023 Unrestricted Sensitive Business Flow — no anti-automation

- **OWASP:** API6:2023 (Unrestricted Access to Sensitive Business Flows)
- **Impact:** Low — no sensitive business flow exists yet (no payment,
  no order placement, no critical workflow auto-exposed)
- **Likelihood:** Low
- **Owner:** backend (when sensitive flow added)
- **Fix path:** N/A until a sensitive business flow ships; when it does,
  add captcha / device fingerprint / behavioral signals as appropriate
- **Status:** Open — deferred (no trigger flow yet)
- **Created:** 2026-05-29

### R-007 · API8:2023 Security Misconfiguration — file upload missing extension check

- **OWASP:** API8:2023 (Security Misconfiguration)
- **Impact:** High — upload endpoint validates MIME type only; extension from `file.originalname` used verbatim in stored filename; attacker can fake Content-Type to store files with arbitrary extensions (e.g., `.php`). Deviates from reference pattern in `bom-upload.service.ts`.
- **Likelihood:** Medium — requires authenticated user; not exploitable on Node.js server today, but violates defense-in-depth standard and risks escalation if a static CDN/Nginx is ever placed in front of storage
- **Owner:** backend
- **Fix path:** add `ALLOWED_EXT = ['.jpg', '.jpeg', '.png']` check in `fileFilter` (machines.controller.ts:120–123), matching the `bom-upload` reference pattern
- **Status:** Open
- **Created:** 2026-06-11 (F-Machine-Tracker review)
- **Finding ref:** `docs/security/findings/2026-06-11-machine-tracker.md` F-001

### R-008 · A09:2021 Insufficient Logging — audit trail identity not tied to JWT

- **OWASP:** A09:2021 (Security Logging and Monitoring Failures)
- **Impact:** Medium — audit records for maintenance logs, repair tickets, and status changes store free-text `performed_by`/`changed_by` from DTO body; authenticated user_id (JWT `sub`) is never persisted; no cryptographic link between DB record and authenticated system account
- **Likelihood:** Low — all users are internal SSI Steel employees (single-tenant); risk is audit integrity and forensics, not active exploitation
- **Owner:** data (schema FK) + backend (service use of `user.sub`)
- **Fix path:** add `created_by_user_id Int?` FK → `identity_user.id` on `maintenance_log`, `repair_ticket`, `machine_status_history`; populate from `@CurrentUser()` in service methods (remove `_` prefix from `_user` parameter)
- **Status:** Open
- **Created:** 2026-06-11 (F-Machine-Tracker review)
- **Finding ref:** `docs/security/findings/2026-06-11-machine-tracker.md` F-002

### R-006 · API8:2023 Security Misconfiguration — `.env` plaintext deferred

- **OWASP:** API8:2023 (Security Misconfiguration)
- **Impact:** Medium — some env values still live in `.env` plaintext rather
  than GCP Secret Manager; risk if file leaks (e.g., misconfigured
  `.gitignore`, accidental commit, backup leak)
- **Likelihood:** Low — `.env` is `.gitignore`d; secrets rotation possible
- **Owner:** devops
- **Fix path:** migrate remaining `.env` values to Secret Manager
  (`bdt-dev-<var>` / `bdt-staging-<var>` naming); update `setup-env.sh` and
  Cloud Run deploy workflow to pull from Secret Manager
- **Status:** Open
- **Created:** 2026-05-29

### R-009 · A09:2021 Security Logging and Monitoring Failures — log-injection pattern in interpolated logger calls

- **OWASP:** A09:2021 (Security Logging and Monitoring Failures) / CWE-117
- **Impact:** Low — untrusted string values (attacker-influenceable via HTTP body or uploaded file content) are interpolated directly into `logger.warn/log` template strings without sanitization in several backend services. Left unsanitized, this allows CR/LF or control-char injection to forge fake log lines (log forgery), complicating incident forensics.
- **Likelihood:** Low-Medium — `backend/src/modules/bom-upload/bom-upload.service.ts:208,219`, `bom-matching.service.ts:186,190`, and `product-derivation/product-derivation.service.ts:92` interpolate xlsx-derived values (`assembly_mark`, `part_mark`, `product_code`) into log lines; these endpoints are `JwtAuthGuard`-protected (authenticated only) but the values originate from uploaded file content the attacker fully controls.
- **Owner:** backend
- **Fix path:** introduce a shared `sanitizeForLog()` utility (pattern already established in `AuthService.sanitizeForLog()`, strips `/[\x00-\x1F\x7F]/g`) and apply at each interpolation site listed above; consider hoisting to a common util (e.g. `common/utils/log-sanitize.ts`) so future services reuse it instead of reimplementing per-service.
- **Status:** Open — watch item, not yet actively exploited or blocking any feature
- **Created:** 2026-07-02 (F-Login Error Handling review) — surfaced while independently verifying the `auth.service.ts` CWE-117 fix (commit `35694c8`) landed in the same feature; this entry generalizes the pattern to other services with the same shape
- **Finding ref:** `docs/security/findings/2026-07-02-login-error-handling.md` F-003

### R-010 · A09:2021 Security Logging and Monitoring Failures — raw error objects logged to browser console (client-side)

- **OWASP:** A09:2021 (Security Logging and Monitoring Failures) / CWE-532-adjacent (client-side analogue)
- **Impact:** Low — `console.error(e)` / `console.error(err)` calls across ~19 frontend files log the full caught `AxiosError` object (not just `.message`) on request failure. `AxiosError.config` can carry the `Authorization: Bearer <JWT>` header and request body for the failed call. Exposure is limited to the requesting user's own browser devtools console (not transmitted anywhere) — risk materializes only via local device access, screen-share/recording, or a malicious browser extension with console-read access.
- **Likelihood:** Low — same shape of bug the Login feature was already flagged and fixed for (`AuthContext.tsx`, commit `26011d0`, now logs `err.message` only), but the fix was scoped to that one call site and never generalized. Confirmed still present (pre-existing on `dev`, unrelated to any single feature) at: `src/pages/ResourceList.tsx:59`, `src/pages/OperationBuilder.tsx:197,212,222`, `src/pages/OperationLibraryList.tsx:63`, `src/pages/BindingRuleManager.tsx:55`, `src/pages/RoutingBuilder.tsx:2172`, `src/pages/RoutingList.tsx:94`, `src/pages/BomRoutingConfig.tsx:83`, `src/pages/BomPaintConfig.tsx:127`, `src/pages/BomWireConfig.tsx:79`, `src/pages/CustomerList.tsx:142`, `src/pages/ProductList.tsx:415`, `src/pages/ProductDetail.tsx:912`, `src/pages/ActivityBuilder.tsx:420`, `src/pages/ActivityLibraryList.tsx:40`, `src/pages/MaterialRegisterModal.tsx:124`, `src/pages/WorkcenterMaster.tsx:183,355`, `src/components/bom/UpdateBomModal.tsx:127`, `src/components/bom/ZoneSummaryTab.tsx:179`, `src/components/product/AddLibraryEntryModal.tsx:106`, `src/components/product/EditLibraryEntryModal.tsx:112`, `src/components/product/NewCustomProductModal.tsx:138`, `src/components/product/NewStandardProductModal.tsx:335`.
- **Owner:** frontend
- **Fix path:** replace `console.error(e)` / `console.error(err)` with `console.error(e instanceof Error ? e.message : String(e))` (the `AuthContext.tsx` pattern) at each site, or centralize via a small `logClientError()` util so it isn't reimplemented per-file; low priority, batch with next frontend cleanup pass.
- **Status:** Open — watch item, not yet actively exploited or blocking any feature
- **Created:** 2026-07-02 (F-BOM Error Handling review) — surfaced while re-applying the Login feature's "raw error object → console" lens to this branch's incidental touches (`meta` add/revert) on 6 of these files; none of the flagged lines are part of the BOM Error Handling diff itself (confirmed net-zero), so this is logged as a follow-up rather than blocking that PR
- **Finding ref:** `docs/security/findings/2026-07-02-bom-error-handling.md` (Observation section)

### R-011 · API1:2023 BOLA — BIM Viewer `bim_model`/`bim_element` routes join the R-001 pattern

- **OWASP:** API1:2023 (Broken Object Level Authorization)
- **Impact:** High — every `:id`-scoped route in `bim.controller.ts`
  (`getStatus`, `retry`, `getElements`, `getViewerToken`) and
  `bim.service.ts`'s `findOrThrow` resolves by primary key only, no
  project-membership check; `getViewerToken` additionally hands back a
  working (if narrowly `viewables:read`-scoped) APS access_token, usable
  directly against Autodesk's API by anyone who knows/guesses a valid
  `bim_model` id.
- **Likelihood:** High — identical, zero-mitigation gap; re-verified
  2026-07-21 against the live code, not just the prior automated pass.
- **Owner:** backend
- **Fix path:** same as `R-001` — this is not a separate architecture
  problem, it's the same missing project-membership/ACL primitive
  surfacing in a fifth+ module. Add `bim_model`/`bim-models` to `R-001`'s
  affected-module list when that fix lands; no separate BIM-specific
  fix should be built in isolation.
- **Status:** Open
- **Created:** 2026-07-21 (F-BIM-Viewer review)
- **Finding ref:** `docs/security/findings/2026-07-21-bim-viewer.md` F-001
- **Release note:** reviewed as a release-gate WARN, not BLOCK, for the
  Sprint 23 BIM Viewer ship — pre-existing app-wide convention (not a
  regression introduced by this feature), identical to what `bom-upload`,
  `drawings`, `work-orders`, `manufacturing-orders`, `customers` already
  ship with today. See finding F-001 for full reasoning.

### R-012 · A03:2021 Injection (Stored XSS) — file-preview iframes trust fetched `Content-Type` with no sandbox, and upstream `Content-Type` is client-supplied with no allowlist

- **OWASP:** A03:2021 (Injection, XSS) / API8:2023 (Security
  Misconfiguration)
- **Impact:** High — `POST /file-storage/presigned-upload` accepts a
  client-supplied `contentType` with no allowlist; on the GCS driver this
  is served back verbatim on download. `DrawingPreviewPanel.tsx`'s new PDF
  preview (Sprint T01) is the first code path in the app that renders
  fetched blob bytes in-page (`URL.createObjectURL` → unsandboxed
  `<iframe>`) rather than forcing a download — a `blob:` URL's origin is
  the app's own origin, so a spoofed `Content-Type: text/html` object
  renders as live, same-origin HTML/JS. The JWT lives in
  `localStorage['bdt_token']` (`src/api/client.ts`,
  `src/context/AuthContext.tsx`), so this is a realistic path to full
  session/account takeover of any user who opens a planted preview. No CSP
  is configured anywhere in the app (`vercel.json`, `index.html`) to blunt
  this.
- **Likelihood:** Medium — requires an authenticated account (internal SSI
  Steel users only, single-tenant) to plant the payload via `presigned-
  upload` + `POST /drawings`, and a target user to open that specific
  file's preview. Compounded (not caused) by `R-001`/`R-011`'s
  permission-ungated drawings module — no elevated privilege is needed
  beyond "any logged-in user."
- **Owner:** frontend (force-retype the fetched blob to `application/pdf`
  in `useDrawingPdfUrl()` before `URL.createObjectURL()`) + backend
  (`presigned-upload` content-type allowlist)
- **Fix path — CORRECTED 2026-09-14 (same day, third pass):** the
  originally-recommended `sandbox=""` on `DrawingPreviewPanel.tsx`'s
  preview `<iframe>` was implemented, then **reverted** after live-browser
  testing (Playwright, real Chrome) showed it blocks the native PDF viewer
  entirely ("This page has been blocked by Chrome" — Chromium bug 413851:
  the native viewer is implemented as a plugin, `sandbox` unconditionally
  disables plugins, no token re-enables them). The fix now standing on
  `dev-t-drawing-pdf-upload` is: (1) backend `contentType` allowlist in
  `FileStorageController.presignedUpload()` — unchanged from the original
  fix; (2) frontend — `src/hooks/useDrawings.ts`'s `useDrawingPdfUrl()`
  re-wraps the fetched blob as `new Blob([blob], { type: 'application/pdf'
  })` before minting the object URL, forcing what the browser renders the
  `blob:` URL as regardless of the server-declared/fetched content type,
  from any source. `sandbox=""` should **not** be reintroduced on this
  iframe — it is confirmed incompatible with the feature, not merely
  unneeded.
- **Status:** Open → **Mitigated** — shipped commit `f257848` on `dev-t-drawing-pdf-upload` (verified
  twice same day — see below). Independently re-reviewed the actual diff
  both times, probed for bypasses (case sensitivity, whitespace, charset
  suffixes, type confusion, JSON duplicate-key smuggling on the backend
  allowlist; sniffing/`Content-Disposition`/original-type-passthrough/
  allowlist-bypass-robustness on the frontend force-retype — none found
  exploitable in either pass), and re-ran the relevant test suites myself
  each time (backend Jest 5/5 pass; frontend Vitest 13/13 pass across
  `useDrawings.test.tsx` + `DrawingPreviewPanel.test.tsx`, including the
  force-retype test and the no-sandbox test). Full re-review recorded in
  the finding ref's "Second Correction" section. **Move this entry to
  "Mitigated risks" with the commit hash once `/release-gate` commits this
  branch** — leaving it here (not yet moved) only because no commit ref
  exists yet, per this register's own convention.
- **Verification note:** the backend allowlist alone still closes the
  concrete PoC (only `application/pdf`/`application/octet-stream` can ever
  reach GCS as stored `Content-Type`, and neither is browser-renderable as
  same-origin HTML/script). The frontend force-retype is a genuine,
  independent second layer that does **not** rely on `sandbox` — the
  `Blob()` constructor's `type` option fully and structurally overrides
  what the browser treats the resulting `blob:` URL's Content-Type as
  (confirmed against the File API Blob URL Store algorithm: a blob: URL's
  response is synthesized entirely from the JS-side Blob object's own
  `type`/bytes, nothing from the original HTTP response — headers
  included — survives into it). Confirmed `application/pdf` is not in any
  of the WHATWG MIME Sniffing spec's sniffable-override categories
  (absent/unknown/`text/plain`-variant/same-category-image-audio-video),
  so a declared `application/pdf` cannot be sniffed back into HTML/script
  execution regardless of the actual bytes. Same fix pattern independently
  confirmed as the accepted mitigation for this exact bug class by a prior
  real-world advisory (wireapp/wire-webapp GHSA-382j-mmc8-m5rw, stored XSS
  via `createObjectURL` on an attacker-influenced blob type — fixed by
  constraining the type before `createObjectURL`, same technique). Prior
  non-blocking follow-up (confirm live-browser rendering) is now resolved:
  it *was* broken (sandbox blocked all PDF rendering), root-caused to the
  sandbox layer specifically (not the allowlist, not the retype), and
  fixed by removing sandbox and relying on force-retype instead — not by
  loosening sandbox tokens (no working token combination exists; confirmed
  via fresh research, not assumed). Residual, explicitly out-of-scope
  observation: without `sandbox`, a *validly-formed* malicious PDF could
  still use in-format capabilities (link/navigation actions, PDFium's
  limited form-JS subset) — generic to any PDF-preview feature anywhere,
  not a content-type-confusion or same-origin-script-execution issue, and
  `sandbox=""` was never capable of mitigating it here either (Chromium
  never ran the native viewer under sandbox at all), so removing it is not
  a regression against any previously-working protection.
- **Created:** 2026-09-14 (F-Drawing PDF Upload + Preview review, T01)
- **Finding ref:** `docs/security/findings/2026-09-14-drawing-pdf-upload.md` F-001
  (see "Second Correction — sandbox reverted, force-retype is the
  mitigation" section, added 2026-09-14, third same-day pass — supersedes
  the earlier "Fix Verification" section's `sandbox=""`-based reasoning,
  which described a fix no longer present in the code)
- **Related, not superseded:** `docs/security/findings/
  2026-08-24-drawing-gcs-dxf.md` F-01 flagged the same root cause (missing
  `contentType` allowlist on `presigned-upload`) earlier, scored Medium and
  framed around unauthorized-overwrite/integrity risk — that entry predates
  this one because no in-page-render sink existed yet to turn it into an
  XSS chain. The allowlist fix verified here also closes that entry's
  content-type root cause, though F-01's arbitrary-key overwrite concern is
  broader and would still need its own key-prefix check to fully close —
  F-01 itself stays Open, unaffected by this verification.
- **Release note:** reviewed as a release-gate **BLOCK** for the T01 /
  F-Drawing PDF Upload + Preview ship (Severity High per the release-gate
  table) — see finding F-001 for full reasoning and PoC. **Re-reviewed
  2026-09-14 (same day): RESOLVED**, fixes verified effective, no bypass
  found — clears the BLOCK once this branch commits. Pending commit ref
  to formally close.

### R-013 · A04:2021 Insecure Design — destructive schema migrations shipped without staging-data verification or backfill

- **OWASP:** A04:2021 (Insecure Design) — best-fit mapping, flagged as
  imperfect: this is a data-integrity/availability risk from the dev team's
  own migration process (irreversible loss of live business data), not a
  classic attacker-driven confidentiality vulnerability, so neither the
  OWASP API Top 10 2023 nor Top 10 2021 lens has a clean category for it.
  Framed as a missing design-time control ("verify before destroy" gate on
  any migration dropping columns/tables that predate the branch) rather than
  an implementation bug.
- **Impact:** Critical/High depending on instance — a `DROP COLUMN`/`DROP
  TABLE` migration on a table that existed before the current branch, shipped
  with no backfill into the replacement schema and no query confirming the
  columns are actually empty on the target (staging/production) database.
  First observed with real, evidenced impact on `work_order.{bom_assembly_id,
  qty_done, qty_scrapped, qty_reusable, bom_dispatch_id_snapshot}` (live since
  Sprint 14, 2026-06-16) and `manufacturing_order.due_date` (live since the
  Sprint 13 MO pilot) — both actively-used, user-facing columns dropped with
  zero backfill in `dev-t-wo-multimark-team-qc`'s migration set.
- **Likelihood:** Medium — this repo's own migration history shows the
  precursor pattern recurring: migration comments asserting "no data loss...
  checked against every environment" that, on inspection, were only ever
  checked against local dev, and this project's own migration comments
  separately admit local dev has "pre-existing, unrelated drift" from
  migration history (renamed FK constraints, a dropped `stock_quant` table,
  a missing FK) — i.e. local dev is demonstrably not a reliable proxy for
  staging/production state on this project, so a comment's confidence level
  cannot be taken at face value without an actual query against the real
  target.
- **Owner:** data (schema/migration authoring + backfill design) + backend
  (flags when a column being dropped is read/written elsewhere) + devops
  (runs the read-only staging verification query pre-merge, per
  `feedback_staging_credentials_self_managed` — this is a human/devops step,
  not something an agent should do unprompted)
- **Fix path:** before merging any migration with `DROP COLUMN`/`DROP TABLE`
  touching a table that predates the branch, run a read-only `COUNT`/
  non-null check against the actual staging database for the columns about
  to be dropped, and record the real number in the migration's own comment —
  replacing unverifiable phrasing like "checked against every environment"
  with an actual count from the environment that matters. For any non-zero
  count, either add a backfill step into the new schema shape before the
  drop, or obtain and document explicit sign-off that the loss is accepted.
  Migrations that drop a table/column created earlier in the *same, still-
  unmerged* migration batch are exempt in practice (no window exists for
  real data to have landed there) but should still say so explicitly rather
  than reuse the "checked every environment" phrasing.
- **Status:** Open — the risk class (missing verify-before-destroy gate)
  stays open as a process gap even though this instance's concrete findings
  are resolved (see below); it will recur on the next branch with a
  destructive migration unless the Fix path above becomes standard practice.
- **Created:** 2026-09-24 (F-WO Multi-Mark Team QC review)
- **Finding ref:** `docs/security/findings/2026-09-24-wo-multimark-team-qc.md`
  F-001 (Critical), F-002 (High), F-003 (Low — the overclaimed-phrasing
  sub-issue)
- **Instance resolution (2026-09-24, same day):** read-only `COUNT` queries
  run against live staging (project `eebubyfkzeqhzwzqrqfz`) resolved both
  concrete findings differently: F-001's `qty_done`/`qty_scrapped`/
  `qty_reusable` were confirmed 0/218 non-null (safe as written), but
  `bom_assembly_id`/`bom_dispatch_id_snapshot` were confirmed **218/218**
  non-null — a real, evidenced data-loss risk, not a false positive. Fixed by
  adding a backfill `INSERT INTO work_order_mark ... SELECT ... FROM
  work_order JOIN mo_assembly_line` directly into
  `20260917114912_multi_mark_work_orders/migration.sql` (before the
  `DROP COLUMN`, since a later migration cannot recover already-dropped
  data), sourcing `qty_planned` from `mo_assembly_line.qty` — verified
  lossless via a 218-row join-match count and tested against a throwaway
  scratch database with synthetic rows before being trusted. F-002's
  `due_date` was confirmed 0/5 non-null — genuinely safe, no code change
  needed, comment updated with the verified count. See findings file's
  "Resolution" section for full detail.

### R-015 · API3:2023-adjacent / A03:2021 — interface-typed request-body DTOs silently bypass the global ValidationPipe

- **OWASP:** API3:2023 (Broken Object Property Level Authorization),
  cross-referenced with A03:2021's input-validation principle
- **Impact:** Medium-High depending on the field — the endpoint has *no*
  request-body validation at all, not a narrower gap on one field. Impact
  for any given field depends entirely on how that field's value is used
  downstream (see the confirmed-safe case below); a future field added to
  the same interface without checking how it's consumed could land
  anywhere from harmless to a real injection/type-confusion path.
- **Likelihood:** Confirmed present today, not hypothetical — verified by
  reading the actual installed `@nestjs/common@10.4.22` ValidationPipe
  source (`backend/node_modules/@nestjs/common/pipes/validation.pipe.js:104-109`):
  a `@Body()` parameter typed as a plain TypeScript `interface` (rather
  than a `class-validator`-decorated class) compiles to `Object` at
  runtime, which is explicitly in the pipe's own validation-skip list —
  regardless of the global pipe's `whitelist`/`transform` config. Confirmed
  exactly 2 occurrences repo-wide via
  `grep -rl "^export interface Create.*Dto\|^export interface Update.*Dto" backend/src/modules/`:
  `backend/src/modules/routings/services/operation-template.service.ts`
  (`CreateOperationTemplateDto`/`UpdateOperationTemplateDto`, consumed by
  `POST/PATCH /operation-templates`) and
  `backend/src/modules/projects/project-progress.service.ts` (not reviewed
  — outside the diff that surfaced this risk, named here for completeness
  of the repo-wide pattern only).
- **Owner:** backend
- **Fix path:** Convert both interfaces into real `class-validator`-
  decorated classes, matching the pattern every other DTO in the backend
  already correctly uses (`@IsString() @MaxLength(n)`, `@IsInt()`,
  `@IsOptional()`, `@ValidateNested({ each: true })` for nested arrays,
  etc.). As a repo-wide follow-up: grep for this `export interface
  ...Dto` shape periodically (or add an ESLint/type-level check) so a new
  instance of this pattern doesn't get reintroduced on the next endpoint.
- **Status:** Open
- **Created:** 2026-09-28 (S36 Leftovers + Operation Icon + MO Print
  Packet Round 4 review)
- **Finding ref:**
  `docs/security/findings/2026-09-28-s36-leftovers-op-icon-print-r4.md`
  F-001 (High) — for the `operation_template.icon` instance specifically,
  traced its full downstream use and confirmed no injection/XSS path
  exists today (it's used only as a safe dictionary-lookup key on both
  frontend and backend, never rendered/interpolated as content) — the risk
  here is the missing validation boundary itself (malformed input reaches
  Prisma/Postgres unvalidated, surfacing as an unhandled 500 instead of a
  clean 400), not a confirmed live exploit.

---

## Mitigated risks

### R-014 · API8:2023 Security Misconfiguration — Supabase Data-API RLS disabled workspace-wide (~85 public tables)

- **OWASP:** API8:2023 (Security Misconfiguration)
- **Impact:** High (as filed) — Postgres Row Level Security was disabled on
  all ~85 public-schema tables workspace-wide, confirmed 2026-08-25 via
  Supabase's own advisor output during an unrelated staging-cleanup session
  (see `knowledge-base/log.md`'s 2026-08-25 entry). With RLS off, any caller
  reaching these tables through Supabase's auto-generated Data API
  (PostgREST) — as opposed to this app's own NestJS backend, which connects
  via direct/pooler Postgres URLs and enforces its own JWT + permission-
  module checks — would bypass all app-level authorization entirely.
- **Likelihood:** Low-Medium in practice — this app's real traffic path is
  Vercel → Cloud Run (NestJS) → Postgres, not through Supabase's Data API;
  actual exploitability depended on whether the Data API surface was even
  reachable with a usable key, not on RLS being off alone.
- **Owner:** devops (Supabase project/dashboard configuration, not
  application code)
- **Fix:** user enabled the Data-API RLS enforcement toggle directly in the
  Supabase dashboard (2026-09-23) — a project-configuration change, **no
  code commit**. No `docs/security/findings/` doc exists for this one; the
  only prior record is the `knowledge-base/log.md` 2026-08-25 entry.
- **Status:** Mitigated — dashboard config, no commit ref
- **Created:** 2026-08-25 (first confirmed, mis-filed at the time — see
  correction below); this register entry backfilled 2026-09-24 as part of
  the Sprint 36 documentation backfill.
- **Correction (2026-09-24):** `knowledge-base/log.md`'s 2026-08-25 entry
  says this was "already tracked as risk R-011 from the BIM viewer security
  review, not new" — **that was wrong**. `R-011` is a distinct, unrelated
  risk (BIM Viewer BOLA — `bim_model`/`bim_element` routes with no
  project-membership check, an application-layer authorization gap in this
  app's own NestJS controllers). This RLS/Data-API gap is a Supabase
  project-configuration issue, orthogonal to R-011's app-code gap — fixing
  one has no effect on the other. Filed here as its own risk, R-014, so nobody
  assumes R-011 already covers it.

---

## Accepted risks

_(none yet)_

---

## How to use this register

- **New risk:** append below "Open risks" with next R-### + four required
  fields (Impact / Likelihood / Owner / Fix path). Tag OWASP category.
- **Risk fixed:** move to "Mitigated risks" with closing note + commit ref.
- **Risk accepted:** move to "Accepted risks" with rationale + approver.
- **Never delete or reorder entries.** Append-only.
- Audit cycle: re-review every sprint close + after every security incident.

## See also

- `wiki/tech/roles/security.md` — review-only role card + OWASP checklist
- `wiki/tech/backend/anti-patterns.md` — security-relevant anti-patterns
- `docs/security/findings/` — per-review finding reports

_Initialized 2026-05-29 from the OWASP API Top 10 ⚠️ items in the security
role card._
