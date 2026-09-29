# QA Findings — Progress Sections by Department + Change Password (dev-t-progress-dept-perms → staging)

- **Scope:** exactly `git diff origin/staging origin/dev-t-progress-dept-perms` (after `git fetch`,
  branch = `7f07bbd`, PR #199, base `dev`). 2 commits, 21 files:
  - `86f1398` progress sections editable only by their owning department (BDP / BSC / BCD)
  - `7f07bbd` user menu — Change password (`POST /auth/change-password`), dropdowns close on outside click / Escape
- **Reviewer:** `qa` role (run as general-purpose agent; named type unavailable).
- **Date:** 2026-09-29. Read-only: no source changed, nothing committed. Ran against a temporary
  `git worktree` of `origin/dev-t-progress-dept-perms`, removed afterwards.

## Verification performed (fresh, not taken from the tester's claims)

| check | result |
|---|---|
| `backend: npx jest src/modules/projects src/modules/auth` | ⚠️ 149/150. The only failure is `getProjectRows › rows carry stages…` (`a.dispatch.zone` undefined in the mock). It **fails the same way on `origin/staging`** (checked in a separate temp worktree), so it was already broken before this branch (QA-F-007) |
| `backend: npx tsc --noEmit -p tsconfig.json` | ✅ exit 0 (main checkout, HEAD = `7f07bbd`, no tracked changes) |
| root `npx vitest run` | ✅ 18 files, 153/153 |
| root `npx tsc -b` | ✅ exit 0 |
| root `pnpm run build` | ✅ built (only the >1000 kB chunk warning that was already there) |
| CI | n/a. PR #199 has only Vercel status contexts (pending); the repo has no test workflow |

### Diff review — write paths to `bom_assembly_progress`

I grepped all of `backend/src` for `bom_assembly_progress.*`, nested `progress: { create/upsert/update… }` writes, and `$executeRaw*` / `$queryRaw*`:

| write site | guarded? | note |
|---|---|---|
| `project-progress.service.ts:168` single edit (`upsert`) | ✅ `:167` | read + diff + assert + upsert all run in one interactive `$transaction` |
| `project-progress.service.ts:314` bulk edit (`upsert` per row) | ✅ `:309` | throws inside the interactive `$transaction` callback. Prisma rolls back the rows upserted earlier in the loop, so nothing is half-written. Pcs are clamped per row before the diff, so the diff sees the real per-row value |
| `progress-history.service.ts:128` rollback (`upsert`) | ✅ `:127` | inside `$transaction`, so the same rollback semantics apply |
| `bom-upload.service.ts:1089` carry-forward (`createMany`, `skipDuplicates`) | n/a | a system copy of existing values onto **new** assembly ids during a BOM upload. It is not a user edit of an existing row, so leaving it unguarded is correct |
| raw SQL / nested relation writes | none | no `$executeRaw` anywhere in `backend/src`. There is also no Excel import route (only export), which matches the spec |

- `AUDITABLE_FIELDS` (19) are exactly the union of the 3 sections' fields, so every diffable field belongs to one section. `claimed_weight_kg` and `delivered_weight_kg` are no longer written by any path.
- The placeholder delete/restore endpoints change `bom_assembly.status` only. They are gated by `project-tracking:delete`, not by department, and do not write progress values.
- In bulk, `progress` is read **before** the transaction (`:274-277`). That was already true, and it only matters for fields the caller actually sends, so there is no practical bypass.

### Frontend coverage

- `ProgressEditFields` (`ProgressEditForm.tsx`) is shared by the row accordion in `ProgressAssemblyTable.tsx` **and** by `ProgressEditModal.tsx`, so both are locked. The bulk panel is locked separately (`ProgressAssemblyTable.tsx:283-368`).
- `MobileProgressFormFields` is shared by `MobileProgressForm` (page) **and** `MobileProgressSheet` (3D sheet), so both are locked. It sends a diff-only payload (`:47`, `:117`).
- No other UI calls `updateAssemblyProgress`, `bulkUpdateAssemblyProgress` or rollback (grep over `src/`). I found no quick-action buttons that set progress fields around the disabled inputs.
- Change password: a wrong current password returns **400**, which the axios interceptor (`src/api/client.ts:19`) does **not** treat as a logout, so the dialog shows the backend message. A 401 (user deactivated, or token expired) logs the user out, which is correct.

---

## Checklist (qa.md release-readiness table)

| # | check | result |
|---|---|---|
| 1 | Notion task DoD all checked | n/a. The Notion task wasn't provided, and I didn't make one up |
| 2 | Wiki test summary exists | ✅ `testing/per-feature/progress-dept-perms-and-change-password.md` (2026-09-29) |
| 3 | Summary coverage = all PASS | ✅ all rows ✅. The single test failure is noted in the summary as already existing |
| 4 | Raw test report | n/a. The summary plus my fresh re-run above stand in |
| 5 | Coverage on changed files | not measured. Each new branch (assert, 3 write paths, changePassword) has a direct unit test |
| 6 | CI green | n/a (no test workflow). I re-ran everything locally |
| 7 | Wiki diff for the changed area | ⚠️ partial (QA-F-003) |
| 8 | Manual test evidence | ✅ the live API matrix, web and mobile screenshots, and change-password runs are recorded in the summary |
| 9 | Smoke test | n/a. There is no Playwright suite |
| 10 | Security BLOCK | not visible to this pass (security runs in parallel) |

---

## Findings

### QA-F-001 — Fabrication department code is `BDP`, but the app's own department list says `BPD`
- **where:** `backend/src/modules/projects/progress-department.ts:12` and `src/lib/progressDepartments.ts:12` (`'BDP'`) vs `src/api/users.ts:159` `KNOWN_DEPARTMENTS = ['BTE', 'BPD', 'BSC', 'BCD']` (this list feeds the Users page department dropdown, `UsersPage.tsx:591`). Wiki: `tech/data-model.md:228` and `features/user-module-permissions.md:1164` also list `BPD`.
- **what:** the check is an exact string match (after trim and uppercase). When an admin creates a fabrication user from the dropdown, that user gets `role = "BPD"`. `editableSections("BPD")` returns `[]`, so every section is view-only for them.
- **scenario:** admin creates "Kirati", picks department **BPD** from the dropdown, and Kirati opens Progress. All sections show 🔒, and Save/Apply is hidden. Any API edit returns 403 "แผนก BPD ไม่มีสิทธิ์แก้ไขส่วน: Fabrication (เฉพาะแผนก BDP)". This hits the fabrication department, the main user of the form. The tester's matrix used hand-made `test-dept-bdp` users, which is why it didn't catch this.
- **evidence:** the grep above. Only the legacy Excel label (`progress-excel.ts:41` "Kirati BDP") uses `BDP`.
- **severity:** **High** (a core acceptance path fails for 1 of the 3 departments through the normal admin flow). This drops to Medium if every real fabrication user on staging/prod already has `role = 'BDP'`. I could not check this: the read-only DB query was denied, and staging credentials are managed by the user.
- **fix_route:** be + fe. Confirm the real code with the user, then make both maps and `KNOWN_DEPARTMENTS` agree (or accept both spellings). Check `res_users.role` on staging before promoting.

### QA-F-002 — Section → department mapping disagrees with the legacy sheet's owners
- **where:** `progress-department.ts:11-16` vs `progress-excel.ts:40-45` (`GROUP_RESPONSIBLE_LABELS`: fabrication BDP, transport BSC, **payment BCD**, **erection BTC**)
- **what:** the feature puts Payment and Transport under BSC, and Erection under BCD. The legacy client sheet names BCD as the owner of payment and "BTC" as the owner of erection.
- **scenario:** after release, the person the sheet names for payment (Tedasak, BCD) can't set Payment status. BCD instead gets Erection.
- **evidence:** the spec records the mapping as approved by Tao on 2026-09-29, so this may be intentional. It still needs an explicit confirmation, because the two sources conflict.
- **severity:** Medium
- **fix_route:** user confirmation, then wiki-integrator (record the decision in `features/progress-department-permissions.md`)

### QA-F-003 — Wiki drift: API docs and data-model claims not updated
- **where:** wiki `tech/backend/api.md:262-264` (no `POST /auth/change-password`), `api.md:589-590` (progress PATCH/bulk don't mention the department 403), `tech/data-model.md:228` ("role … never consulted at request time by any guard", which is now false). Also, the spec's status line still says "not committed yet", but both commits are pushed and PR #199 is open.
- **what / evidence:** the grep above
- **severity:** Medium (wiki drift, per the qa heuristic)
- **fix_route:** wiki-integrator

### QA-F-004 — Rollback conflict check runs before the department check
- **where:** `backend/src/modules/projects/progress-history.service.ts:95-98` vs the assert at `:127`
- **what:** BCD opens History and clicks Rollback on a Fabrication batch that was edited again later. The first call returns the conflict list, the user confirms "force", and only then gets a 403. The Rollback button is also shown to every department (`ProjectProgressHistory.tsx`). No data is written, so this is only a wasted step.
- **severity:** Low
- **fix_route:** be/fe (optional: check the department before conflicts, or hide Rollback when the batch touches sections the user doesn't own)

### QA-F-005 — Change password leaves existing tokens valid and has no rate limit
- **where:** `backend/src/modules/auth/auth.service.ts:65-81`, `auth.module.ts:13` (`JWT_EXPIRES_IN` default `7d`)
- **what:** after a password change (for example, because the password leaked), any token already issued stays valid for up to 7 days. Wrong-current-password attempts are unthrottled, although the caller must already have a valid token. Both are noted in the code and in the tester's known gaps. The security reviewer has the final say.
- **severity:** Low
- **fix_route:** be (follow-up; token versioning or a throttler)

### QA-F-006 — ChangePasswordDialog UX edges
- **where:** `src/components/layout/ChangePasswordDialog.tsx:56-57`
- **what:** a mousedown on the backdrop closes the dialog and throws away what was typed (for example, a slightly-off click while switching fields). Escape doesn't close the dialog, even though it now closes the dropdowns. The width is a fixed 380px. The dialog is rendered inside the `fixed z-50` header, so its `z-[60]` only applies inside that stacking context; it rendered fine in the tester's check.
- **severity:** Low
- **fix_route:** fe (optional)

### QA-F-007 — `getProjectRows` unit test was already failing
- **where:** `backend/src/modules/projects/project-progress.service.spec.ts:466` → `project-progress.service.ts:394` (`a.dispatch.zone` undefined)
- **what:** the mock doesn't include `dispatch.zone`. It fails identically on `origin/staging`, so this branch didn't cause it, but it keeps the `projects` suite red.
- **severity:** Low
- **fix_route:** tester

### QA-F-008 — A department change only applies at next login (JWT `role`, up to 7d)
- **where:** `projects.controller.ts:126/158/170` pass `user.role` from the JWT, and the frontend reads `user.role` from the stored login payload
- **what:** after an admin moves someone between departments, the old section rights stay in effect until the user logs in again. The spec documents this, and it is consistent with how module permissions already work.
- **severity:** Low (INFO)
- **fix_route:** none (documented)

---

## Addendum — branch moved during review

`origin/dev-t-progress-dept-perms` advanced to `59a7409` while this review was running:
- `5aae41c`: admin is now the exact literal `'admin'` (security F-002). This matches the guard and is covered by spec cases.
- `59a7409`: the locked note is now English, "Editable by X only *".

I read both diffs (6 files, +16/−7). They don't change anything above: `'BDP'` is still the fabrication code (QA-F-001 stands). I did not re-run the test commands on `59a7409`.

## Verdict

**BLOCK**: one High (QA-F-001, BDP vs BPD department code). If the user confirms that the real fabrication users already
have `role = 'BDP'`, QA-F-001 drops to Medium and the verdict becomes **WARN** (QA-F-001/002/003). Everything else is Low.
The enforcement itself holds up: all 3 user write paths are guarded inside transactions, bulk/rollback throw-rollback is
atomic, the diff-based check is correct, the frontend locks are complete through the shared components, and change password
401/400 handling is correct.

---

## Re-verification (2026-09-29)

- **Scope:** fix commits `5aae41c`, `59a7409` and `edba4d7` on `origin/dev-t-progress-dept-perms` (after `git fetch`, head = `edba4d7`), 14 files, +81/−24. I reviewed them in a temporary worktree (since removed) and ran the checks there and in the main checkout (HEAD = `edba4d7`, no tracked changes). No source was edited and nothing was committed.
- **User decisions (explicit):** the Fabrication code is `BDP`, and the list was renamed to match. The new mapping (Payment + Transport = BSC, Erection = BCD) intentionally replaces the owners in the legacy Excel sheet.

### Checks (fresh run)

| check | result |
|---|---|
| backend `npx jest src/modules/projects src/modules/auth src/modules/users` | ⚠️ 164/165. The only failure is the `getProjectRows` test, which was already failing before this branch (QA-F-007, unchanged) |
| backend `npx tsc --noEmit -p tsconfig.json` | ✅ exit 0 (main checkout). In the worktree, the only errors are TS2742 from the symlinked `node_modules`, and there are 0 errors of any other kind |
| root `npx vitest run` | ✅ 18 files, 154/154 |
| root `npx tsc -b` | ✅ exit 0 |
| root `pnpm run build` | ✅ exit 0 (only the chunk-size warning that was already there) |

### Status of the earlier findings

| finding | status |
|---|---|
| QA-F-001 High (BDP vs BPD) | ✅ **Resolved.** `KNOWN_DEPARTMENTS` is now `['BTE','BDP','BSC','BCD']` (`src/api/users.ts:159`), and it agrees with both section maps. No `BPD` is left in `src/` or `backend/src` (the only hits are operator employee IDs in a migration, which is unrelated). A user created from the dropdown now gets `BDP`, which owns Fabrication. Existing staging/prod users with `role = 'BPD'` (if there are any) would need a data fix. The user owns that decision; it is not code |
| QA-F-002 Medium (mapping vs Excel owners) | ✅ **Closed.** The user confirmed the new mapping is intentional, and it is recorded in `features/progress-department-permissions.md:20` |
| QA-F-003 Medium (wiki drift) | ✅ **Mostly resolved.** `api.md:264` documents change-password, `api.md:591` documents the department 403 with the live lookup, `data-model.md:229` adds an "Update 2026-09-29" note under the old claim at `:228`, and the feature page status says committed/PR #199. One small gap remains (QA-F-010) |
| QA-F-004 Low (rollback conflict before the dept check) | ✅ **Resolved.** `progress-history.service.ts:98` checks the department up front, before `detectConflicts`. A spec covers this and asserts that conflict detection never runs. The diff-based check at `:132` is still authoritative |
| QA-F-006 Low (dialog UX) | ✅ Escape now closes the dialog, and a backdrop click no longer does (`ChangePasswordDialog.tsx:17-23`). The Topbar Escape handler also fires, but it only closes dropdowns, which is harmless. The fixed width of 380px is still there, but it's cosmetic |
| QA-F-008 Low (department only refreshed at login) | ✅ **Resolved in the backend.** See the lookup review below |
| QA-F-005, QA-F-007 | unchanged (Low) |

### Review of the new DB lookup

- `ProjectProgressService.departmentOf` (`project-progress.service.ts:131-134`) runs one `res_users.findUnique({ id, select: { role, active } })` and returns `u?.active ? u.role : null`. An inactive or missing user gets `null`, so `editableSections(null)` returns `[]` and they own nothing. An inactive admin is also denied. A spec covers both cases.
- The controller (`projects.controller.ts:120-127, 153-171`) makes all three handlers `async` and passes `await this.progressSvc.departmentOf(user.sub)`. A floating promise can't slip through, because the service params are typed `string | null`, and tsc passes.
- **No N+1:** bulk does exactly one lookup per request, in the controller, before the per-row loop.
- The lookup runs outside the write `$transaction`. So a department change that lands in the same millisecond as a write could let that one in-flight request use the old value. That window is negligible (INFO).

### Rollback pre-check: can it wrongly block?

- **admin:** `editableSections('admin')` returns all sections, so it never blocks.
- **own section:** a batch made by a department user only ever holds entries for fields that actually changed, which are fields in that user's own section, so it passes.
- **mixed batch** (for example, an admin edit that touched Fabrication + Payment, rolled back by BSC): blocked with 403. Before this fix, the diff check would also have blocked it, so the behavior is the same, just earlier. See QA-F-009 for the one edge case where the two checks differ.

### Frontend

The display still uses `user.role` from the login payload (`ProgressEditForm.tsx:68`, `ProgressAssemblyTable.tsx:172`, `MobileProgressFormFields.tsx:86`). **That is acceptable:** the frontend map is labelled display-only, and the backend decides from the live DB. After an admin changes someone's department, what goes wrong until the next login is only this:
- sections they just lost still look editable, and an edit there gets a clear 403 message;
- sections they just gained still look locked.

Neither case writes wrong data. The frontend map agrees with the backend: BDP/BSC/BCD, and `admin` must be exact.

### New findings

#### QA-F-009 — The rollback pre-check is slightly stricter than the diff check
- **where:** `backend/src/modules/projects/progress-history.service.ts:98`
- **what:** the pre-check tests every field in the batch, not only the fields whose value would change. Suppose a mixed batch's out-of-department fields have already been set back to their old values by someone else. That rollback is now refused, where the diff check alone would have allowed it. This is a rare edge case, it fails closed, and admin can still do the rollback.
- **severity:** Low (INFO)
- **fix_route:** none needed; optionally document it

#### QA-F-010 — `user-module-permissions.md` still lists `BPD`
- **where:** wiki `features/user-module-permissions.md:1164` and `:1176` (`BTE`/`BPD`/`BSC`/`BCD`), with no note about the rename
- **severity:** Low (wiki drift)
- **fix_route:** wiki-integrator (one-line update note)

#### QA-F-011 — Frontend lock display uses the department from login (INFO)
- **where:** `src/lib/progressDepartments.ts` callers, listed above
- **what:** after a department change, the locks shown in the UI are stale until the next login, while the backend enforces the live value (see the Frontend section above). This is acceptable as-is. Optionally, it could be refreshed from `/auth/me`.
- **severity:** Low (INFO)

## Revised verdict

**PASS.** The previous High (QA-F-001) is resolved, and the two Mediums are closed: QA-F-002 by explicit user decision, and QA-F-003 by the wiki updates. What remains is Low/INFO only: QA-F-005, QA-F-007 (already failing before this branch), QA-F-009, QA-F-010 and QA-F-011.

One note that is not a finding: before promoting, check whether any existing staging/prod `res_users.role` is `'BPD'`. Those users would own no section until an admin sets them to `BDP`.
