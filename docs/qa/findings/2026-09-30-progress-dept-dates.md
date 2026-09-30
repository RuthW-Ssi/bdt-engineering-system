# QA findings — Progress dept dates shared with BCD (2026-09-30)

Commit `d0ad81d` · branch `dev-t-progress-dept-dates` · diff `origin/dev...d0ad81d`
Decision recommendation: **PASS** (Low / INFO findings only)

## Checks performed

| Check | Result |
|---|---|
| Backend `PROGRESS_GROUPS` ↔ frontend `GROUP_DEPARTMENTS` in sync (7 groups, same keys, same dept lists, same order) | ✅ |
| Every write path calls `assertDepartmentCanEdit` on the diff: single (`project-progress.service.ts:176`), bulk (`:318`), rollback up-front (`progress-history.service.ts:98`) + per-assembly (`:132`) | ✅ (map change only, call sites untouched) |
| UI disabled flags — ProgressEditForm: stages→fabrication, fab dates→fab_dates, payment, load dates→transport_dates, loaded→transport, erection dates→erection_dates, erected→erection | ✅ |
| Same mapping in ProgressAssemblyTable (bulk) and MobileProgressFormFields | ✅ |
| Tests: backend spec (per-role groups, BCD dates+payment allowed, BCD blocked on cut/loaded/erected, owner blocked on other section's dates, field coverage invariant); frontend vitest (`editableGroups`, `lockedNotes`) | ✅ |
| Tester wiki summary (section 2026-09-30) present, live API single + bulk + web screenshot | ✅ (mobile not opened live — accepted) |
| Spec wiki updated (7-group table + decision callout) | ✅ |

## Findings

### F-001 — Production roll-out note conflicts with Erection owner
- **where:** `wiki/features/progress-department-permissions.md:5`
- **what:** Roll-out line says `erection-member` = BCD, but Erection work is owned by BTC. After this change that user gets Payment + all dates but still cannot edit `erected_pcs`.
- **severity:** Low
- **evidence:** "the user set `fabrication-member` = BDP, `supply-chain-member` = BSC, `erection-member` = BCD" vs table row "Erection dates | **BTC, BCD**" / Erection = BTC.
- **fix_route:** user to confirm the account's department; wiki-integrator to update the note.

### F-002 — No component-level test of disabled-flag → group wiring
- **where:** `src/components/progress/ProgressEditForm.tsx:84-162`, `ProgressAssemblyTable.tsx:283-367`, `MobileProgressFormFields.tsx:149-250`
- **what:** Tests cover the lib (`editableGroups`, `lockedNotes`) only; the per-input group keys in the 3 components are verified by review + one web screenshot, not by a test. Mobile path unverified live.
- **severity:** Low (INFO)
- **evidence:** no `*.test.tsx` touches these components in the diff; manual review found all 21 flags correct.
- **fix_route:** tester (optional follow-up).
