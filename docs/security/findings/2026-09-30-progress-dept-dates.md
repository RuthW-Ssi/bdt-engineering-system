# Security review — Progress department groups (Plan/Actual dates shared with BCD)

- **Date:** 2026-09-30
- **Change:** commit `d0ad81d` on `dev-t-progress-dept-dates` (`git diff origin/dev...d0ad81d`)
- **Scope:** `backend/src/modules/projects/progress-department.ts` (4 sections → 7 groups), the call sites in `project-progress.service.ts` and `progress-history.service.ts`, and the frontend mirror `src/lib/progressDepartments.ts`
- **Spec:** wiki `features/progress-department-permissions.md` (decision 2026-09-30)
- **Decision:** **PASS**

## Verified

| Check | Result |
|---|---|
| Map matches spec (7 groups, BCD = payment + 3 date groups only) | OK, `progress-department.ts:15-26` |
| BCD cannot edit %, `loaded_pcs`, `erected_pcs` | OK. The unit tests assert it and pass (21/21) |
| Owners cannot edit other sections' dates | OK. Tested |
| Exact-`'admin'` rule (F-002) kept; `Admin` / `admin ` get nothing | OK, `progress-department.ts:37`. Tested |
| Single-edit path gated after the diff, inside the tx | OK, `project-progress.service.ts:176` |
| Bulk path gated per row; a throw rolls back the whole batch | OK, `project-progress.service.ts:318` |
| Rollback gated (pre-check + per-assembly diff check) | OK, `progress-history.service.ts:98`, `:132` |
| No stale references to the removed `PROGRESS_SECTIONS` / `editableSections` | OK (git grep clean) |
| Frontend mirror equals the backend map (display only) | OK, `src/lib/progressDepartments.ts:12-20` |

## Findings

### F-001 (Low / informational): the department check fails open for fields in no group
- **OWASP:** API3:2023 BOPLA (defense in depth)
- **Where:** `backend/src/modules/projects/progress-department.ts:46`
- **What:** `assertDepartmentCanEdit` only denies the groups that list a changed field. A field that belongs to no group is allowed for every department.
- **Why:** it is not exploitable today, for three reasons:
  - The spec test asserts that the groups exactly cover `AUDITABLE_FIELDS`.
  - `computeDiff` iterates only over `AUDITABLE_FIELDS`.
  - Both write paths build `fields` from that same set.

  A future field added to the write payload but not to `AUDITABLE_FIELDS` would be written with no department check (and no audit entry).
- **Fix (be):** optional hardening. Make the check deny any changed field that is not in a group, or keep the coverage test and add a comment next to the `fields` builders. This does not block release.

## Accepted / out of scope
- R-016 token revocation, R-003 rate limiting: already-known follow-ups. The department is read live from the DB on each write, so role changes take effect immediately.
