# Security Review — Progress Department Permissions + Self-Service Change Password

- **Scope:** `git diff origin/staging origin/dev-t-progress-dept-perms` (release-gate)
  - Field-level authorization on assembly progress: each section is editable only by
    its department (`res_users.role` from the JWT). Fabrication goes to `BDP`,
    Payment/Transport to `BSC`, Erection to `BCD`, `admin` edits all sections, and
    everyone else is view-only. The rule lives in
    `backend/src/modules/projects/progress-department.ts` and is called from
    `project-progress.service.ts` (single + bulk) and `progress-history.service.ts`
    (rollback). The frontend mirror is `src/lib/progressDepartments.ts`.
  - New `POST /auth/change-password` (`auth.controller.ts`, `auth.service.ts`,
    `dto/change-password.dto.ts`) + `src/components/layout/ChangePasswordDialog.tsx`.
- **Reviewer:** `security` role (general-purpose agent), OWASP API Top 10 2023 baseline.
- **Date:** 2026-09-29
- **Read-only review.** No source modified, nothing committed.
- **Verdict: WARN (non-blocking)**: no Critical/High. 1 Medium (a gap in the existing
  stateless-JWT design that this feature makes more visible; proposed new risk-register
  entry), 3 Low, 3 Info.

---

## Checks performed

| Check | Result |
|---|---|
| All writers of `bom_assembly_progress` gated | Three user-driven write paths exist, and all three call `assertDepartmentCanEdit` inside the transaction before the upsert: `project-progress.service.ts:167` (PATCH single), `:309` (PATCH bulk; one forbidden row rolls back the whole batch), and `progress-history.service.ts:127` (rollback). `logBatch` source `'import'` has no caller. The only other writer is the BOM-upload carry-forward (`bom-upload.service.ts` ~L977-1089, `createMany`). That path copies existing progress onto re-uploaded assemblies. It is a system action and not a user edit of section values, so it is out of scope for the department rule. |
| Check runs on the real change set | The check uses `computeDiff(current, fields)` over `AUDITABLE_FIELDS`, which covers every writable progress column. The section field lists in `PROGRESS_SECTIONS` cover all of `AUDITABLE_FIELDS`, so no writable field is outside a section. Date normalization (`toISOString().slice(0,10)`) matches `@db.Date` UTC storage. A timezone-offset input cannot cause a stored change that the diff misses. |
| Role source | The role is read only from the verified JWT (`JwtAuthGuard` → `jwtService.verify` → `req.user`; `@CurrentUser()` → `user.role`). The client cannot supply it through the body or query. |
| Who can set `role` | Only through `/users` (`users.controller.ts:14` `@UseGuards(JwtAuthGuard, AdminGuard)`). The value is free text (`@IsString()`). |
| Module permission still required | Yes. The department rule is layered on top of `@RequiresPermission('project-tracking','update')`, not used in place of it. |
| Change-password: identity | `userId = user.sub` from the JWT (`auth.controller.ts`). The body carries no user id, so there is no BOLA. |
| Change-password: re-auth | `bcrypt.compare(current_password, hash)` is checked before the write (`auth.service.ts:69`). |
| Change-password: enumeration / error messages | There is no enumeration surface because the user comes from the token. A wrong current password returns 400 `Current password is incorrect` (not 401, so the frontend 401 interceptor does not log the user out). A missing or inactive user returns 401 `User not found`. |
| Hashing | `bcrypt.hash(new_password, 12)` (`auth.service.ts:77`). |
| Input bounds / DoS | Class DTO with `@IsString @MinLength(8) @MaxLength(128)`, plus `@MaxLength(128)` on `current_password`. The global `ValidationPipe` (whitelist) applies. |
| Secret logging | Logs contain only the sanitized `login` (`auth.service.ts:70,79`) and never a password. The frontend dialog has no `console.*` and no storage of the fields. The request body goes over the existing `apiClient` (HTTPS). |

---

## Findings

### F-001 · Medium · API2:2023 Broken Authentication / ASVS V3.3 — changing the password does not end existing sessions, and a role change reaches the token only after up to 7 days

- **Where:** `auth.service.ts:62-81` (`changePassword`: comment "The existing token stays
  valid (stateless JWT)"); `auth.module.ts:13` (`expiresIn: JWT_EXPIRES_IN ?? '7d'`);
  `jwt-auth.guard.ts` (verify only, no DB or version check);
  `progress-department.ts:23-26` (acts on `user.role` from the token).
- **What:** Tokens are stateless for 7 days, and nothing (token version,
  `password_changed_at` check, denylist) invalidates them.
  1. A user who changes their password because they think their account is compromised
     does not lock out an attacker who already holds a token. The attacker keeps full
     access for up to 7 days. ASVS 3.3.3 (L2 target) expects a password change to
     offer to end other sessions.
  2. The department rule reads `role` from the token. Module permissions are read live
     from the DB (`hasPermission`), but the role is not. When an admin moves a user out
     of `BDP` or demotes them from `admin`, the old section rights (or full admin
     bypass) remain until the token expires.
- **Exploit scenario:** A `BDP` engineer is moved to another department (or leaves, and
  the account is set to a different role instead of being deactivated). With the
  existing token they can still change fabrication stage % and finish dates on any
  project for up to 7 days. Deactivating the account (`active=false`) does not revoke
  the token either. Only `getProfile` and `changePassword` check `active`.
- **Why not High:** An attacker needs a stolen or retained token. Internal users are
  authenticated, and the change log records `write_uid` for each field change. This is
  a gap in the existing design, not something this diff introduced, but this diff is
  the first feature where the token's `role` carries fine-grained write rights.
- **Fix (route → backend):** Add `token_version` (or `password_changed_at`) to
  `res_users`, embed it in the JWT, and have `JwtAuthGuard` (or `PermissionGuard`, which
  already queries the DB) reject tokens whose version is stale or whose user is
  inactive. Bump the version on password change, admin reset, role change and
  deactivation. Option: have `changePassword` return a fresh token. Short-term
  alternative: have `updateAssemblyProgress`/`bulk`/`rollback` re-read `res_users.role`
  from the DB instead of trusting `user.role`, and/or shorten `JWT_EXPIRES_IN`.
- **Register:** Propose new **R-016 · API2:2023: no JWT revocation (password change,
  role change or deactivation doesn't end live sessions)**, status Open, owner backend.

### F-002 · Low · API5:2023 BFLA — the admin check is normalized in one place and exact-match everywhere else

- **Where:** `progress-department.ts:21,25` (`trim().toUpperCase() === 'ADMIN'`) compared
  with `permission-map.ts:17,47` (`role === 'admin'`) and `admin.guard.ts:10`
  (`user?.role !== 'admin'`). The frontend mirror `src/lib/progressDepartments.ts`
  normalizes the same way as the new backend code.
- **What:** A role stored as `'Admin'`, `'ADMIN'` or `'admin '` (possible because
  `UpdateUserDto.role` / `CreateUserDto.role` are free-text `@IsString()`) counts as
  admin for progress sections, but not for the module permission guard or AdminGuard.
  The reverse (`'admin'` treated as non-admin) cannot happen, so this does **not**
  let anyone gain admin through the existing guard. It is an inconsistency that can
  grant more than intended within this feature only.
- **Exploit scenario:** An admin types `Admin` as a department by mistake and grants that
  user `project-tracking:update`. The user can then edit all three sections (BDP, BSC
  and BCD fields), even though everywhere else they are treated as a normal user. Only
  an admin can set the role, so this is misconfiguration and not something a user can
  exploit.
- **Fix (route → backend):** Canonicalize the role in one shared helper
  (`isAdminRole(role)`, `normalizeDept(role)`) used by `permission-map.ts`,
  `admin.guard.ts` and `progress-department.ts`. Better still, normalize at write time
  in `users.service.ts` (`trim()`, and store `admin` lowercase / departments uppercase,
  or `@IsIn` an allowlist) so the stored value is always canonical.

### F-003 · Low · A04:2021 Insecure Design / A09:2021 — a no-op write from a non-owning department still overwrites `write_uid`/`write_date`

- **Where:** `project-progress.service.ts:167-171` (single) and `:309-317` (bulk). The
  check covers only fields that actually change (by design, "a field resent unchanged is
  not an edit"), but the upsert always sets `write_uid: userId, write_date: now()`.
- **What / scenario:** A `BSC` user (or any user with `project-tracking:update` and no
  department) sends `PATCH …/progress/assemblies/bulk` with every assembly id in a
  project and an empty or unchanged payload. The request passes the department check,
  and every row's "last modified by / at" now shows that user. Section values and the
  change log (`progress_change_*`) stay intact, so this affects metadata integrity only.
  The behavior existed before this diff; the new rule just makes the mismatch visible.
- **Fix (route → backend):** Skip the upsert (or at least the `write_uid` bump) for rows
  whose diff is empty. Optionally reject a request where the caller has no editable
  section at all (`editableSections(role).length === 0`) with 403 before touching rows.

### F-004 · Low · API4:2023 Unrestricted Resource Consumption — `/auth/change-password` has no rate limit (already tracked in R-003)

- **Where:** `auth.controller.ts` `changePassword`, with no throttler. The same applies to
  `/auth/login` (R-003, Open).
- **Scenario:** Someone holding a stolen token can brute-force `current_password` at
  bcrypt speed to learn the real password, which gives persistence beyond the token's
  lifetime together with F-001. Each attempt also costs the server one bcrypt compare
  at the stored cost, and the 128-char cap bounds that.
- **Fix:** Add `/auth/change-password` to R-003's fix path (`@nestjs/throttler`, per-user
  key). This does not need a separate register entry.

### F-005 · Info — bcrypt 72-byte truncation

- `bcryptjs` hashes only the first 72 bytes. `@MaxLength(128)` counts characters, and
  Thai characters are 3 bytes each in UTF-8, so the tail of a long password is silently
  ignored. This is not exploitable and is the same as login and admin reset. Optionally
  cap at 72 bytes or pre-hash.

### F-006 · Info — frontend mirror is display-only

- `src/lib/progressDepartments.ts` only locks the UI. All enforcement is on the server,
  and a direct API call is checked by the backend (verified above). Keep the
  `SECTION_DEPARTMENT` map in sync with `PROGRESS_SECTIONS`. Drift would only confuse
  users and does not open access.

### F-007 · Info — 403 message echoes the caller's own role

- `progress-department.ts:33-37` puts the caller's own `role` text and the owning
  department codes in the 403 body. This is not sensitive because the caller already
  knows their own role and the department map is in the frontend bundle.

---

## Summary

| ID | Severity | OWASP | Status |
|---|---|---|---|
| F-001 | Medium | API2:2023 | Open → propose R-016 |
| F-002 | Low | API5:2023 | Open |
| F-003 | Low | A04/A09:2021 | Open (pre-existing) |
| F-004 | Low | API4:2023 | Covered by R-003 |
| F-005 | Info | — | — |
| F-006 | Info | — | — |
| F-007 | Info | — | — |

No Critical/High, so this does not block release-gate Step 4.
