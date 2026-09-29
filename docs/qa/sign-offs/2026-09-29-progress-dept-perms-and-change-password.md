# QA Sign-off — Progress Sections by Department + Change Password + Dropdown Outside-Click

- **feature:** progress sections editable only by their owning department
  (Fabrication = BDP, Payment + Transport = BSC, Erection = BCD, admin all,
  others view-only) · self-service `POST /auth/change-password` + user menu ·
  bell/user dropdowns close on outside click / Escape
- **commits:** `86f1398`, `7f07bbd`, `5aae41c`, `59a7409`, `edba4d7` on
  `dev-t-progress-dept-perms` → PR #199
- **date:** 2026-09-29
- **qa decision:** ~~BLOCK~~ → **PASS** (re-verified same day after fixes)
- **security decision:** **WARN** (1 Medium — see below), no Critical/High
- **approved_for_ship:** true
- **user_overrode:** true — for the remaining part of security F-001 only
  (tokens are not revoked after a password change / account deactivation,
  7-day JWT, system-wide pre-existing). User chose to fix the department
  half (live DB read) now and accept the token-revocation half as a
  follow-up.
- **forced_ship:** false
- **reviewers:** qa + security as `general-purpose` agents loaded with
  `wiki/tech/roles/{qa,security}.md` (named types unavailable)

## Revision (same day)

- QA High (Users-page list offered `BPD`, map used `BDP`) → user confirmed
  **BDP**; `KNOWN_DEPARTMENTS` renamed (`edba4d7`).
- QA Medium (mapping vs legacy Excel owners) → user confirmed the new mapping.
- QA Medium (wiki stale) → api.md, data-model.md, feature page and
  user-module-permissions.md updated.
- Security F-001 (department from stale JWT) → department read live from
  `res_users` on every write (`departmentOf`); verified live (same token,
  BTE→BSC flips Payment 403→200).
- Security F-002 (admin normalisation) → exact `'admin'`, same as the guard.
- QA Low → rollback pre-checks department before the conflict prompt;
  Change-password dialog closes on Escape, not on backdrop click.

## Evidence

- Tester summary: `wiki/tech/testing/per-feature/progress-dept-perms-and-change-password.md`
- QA re-run on `edba4d7`: backend jest (projects/auth/users) 164/165 — the 1
  failure (`getProjectRows`) is pre-existing on staging; backend `tsc`; root
  vitest 154/154, `tsc -b`, `pnpm run build` — clean.
- Findings: `docs/qa/findings/2026-09-29-progress-dept-perms-and-change-password.md`,
  `docs/security/findings/2026-09-29-progress-dept-perms-and-change-password.md`

## Follow-ups (not blocking)

- Token revocation (token version / denylist) after password change or
  deactivation — security F-001 remainder (proposed R-016).
- Rate limiting on login + change-password (R-003).
- **Before relying on it in prod:** set real users' departments to
  BDP/BSC/BCD; any existing `BPD` users must be changed to `BDP`.
