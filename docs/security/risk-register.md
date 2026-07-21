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

---

## Mitigated risks

_(none yet)_

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
