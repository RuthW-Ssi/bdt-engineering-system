# QA findings — MO/WO feedback round (S38 T09–T15) · 2026-10-14

Branch `dev-t-mo-wo-feedback` @ 5307dd8 vs origin/dev. Primary input: wiki `tech/testing/per-feature/mo-wo-feedback-20261014.md`.

**Decision: WARN** (no Critical/High; 2 Medium need user OK).

## Checks performed

| # | Check | Result |
|---|---|---|
| 1 | Notion DoD | not read this run (no Notion fetch) — relied on tester map T09–T15 |
| 2 | Wiki test summary exists, current date | yes |
| 3 | Summary results all pass | yes (backend full-suite 17 fails = same baseline set) |
| 4 | Re-ran targeted suites | vitest wo/mo/ActualDatesModal/woHistory/WoDetail 123/123 · jest work-orders + manufacturing-orders 628/628 |
| 5 | Coverage | not measured |
| 6 | CI on branch | no runs — branch not pushed yet |
| 7 | Wiki diff | yes — api.md rows 468/469/537, data-model.md §work_order_mark actual_finish + sum rule, wo/mo 4-implementation-delta |
| 8 | Manual evidence | tester live checks 7–10 (finish-date save done by user) |
| 9 | Migration safety | `ADD COLUMN actual_finish TIMESTAMPTZ` nullable, no default/backfill → metadata-only, no lock risk; Supabase pre-check done (column absent, no failed migrations) |

## Findings

### F-1 · Medium · On Plan click overwrites already-recorded actual dates
- where: `src/components/ActualDatesModal.tsx:103-112,160`
- what: `choosePlan()` replaces start/finish with plan dates whenever the radio switches to On Plan — also in the DONE "Edit Actual Dates" mode, where `initial` holds real recorded actuals.
- scenario: DONE WO stored DELAYED, actual finish 12/10 15:00, plan finish 13/10 17:00 (one of the 4 mismatched rows). User opens Edit, flips to On Plan to satisfy the new rule → actual start/finish silently become the plan dates; Confirm saves them and the audit row shows the real dates replaced. Same in Complete if the user typed dates before choosing the result.
- fix_route: fe (only fill when the fields are empty, or only in Complete mode) — confirm intent with user.

### F-2 · Medium · Mark finish date not kept in step with qty_planned changes outside the progress save
- where: `backend/src/modules/work-orders/work-orders.service.ts` acceptNewVersion (~1514-1530 and apply_to_other_wos ~1558-1566); Complete check `:651`
- what: accept-version changes `qty_planned` (and may write QC) without touching `actual_finish`; Complete only checks QC Passed = Quantity, not the finish date.
- scenario A: mark qty 8, QC 8, Finished 10/10 → BOM rev raises to 10, accept → WO table + MO progress show "Finished 10/10" while QC is 8/10 (clears only on the next progress save).
- scenario B: mark qty 10, Done 10, QC 8 → rev lowers to 8 with QC breakdown 8 → QC = Quantity with no finish date; WO can be Completed with that mark's Finished = "—". Same for any mark QC'd to full before this release.
- fix_route: be (clear/require actual_finish when accept-version changes qty; decide whether Complete requires mark finish dates).

### F-3 · Low · Legacy over-quantity marks: Not Started shows negative, two edits needed
- where: `src/components/wo/WoMarksTable.tsx:79-90,357`
- scenario: qty lowered 10→8 after Done 10 (acceptNewVersion allows it). Edit opens with Not Started = −2; lowering Done to 8 moves 2 to In Progress (still −2); user must also zero In Progress. Saveable, but confusing for low-tech users. Backend `= Quantity` rule itself is safe for legacy NS mismatches because the UI always re-derives NS.
- fix_route: fe (clamp/notice).

### F-4 · Low · Complete (no-marks) path still validates `≤`, progress save requires `=`
- where: `work-orders.service.ts:643`
- what: inconsistent rule; a WO whose stored NS+IP+Done < Quantity (pre-10-14 data) still completes. Documented in data-model.md; acceptable, note only.
- fix_route: be (optional).

### F-5 · Low · Stale-check does not include actual_finish
- where: `work-orders.service.ts:798`
- scenario: two users open the same fully-QC'd mark, each types a different Finish Date without changing quantities → second save wins silently (no 409).
- fix_route: be (add actual_finish to `expected`) — low frequency.

### F-6 · Low · Progress matched by mo_assembly_line.bom_assembly_id
- where: `manufacturing-orders.service.ts:486`
- what: WO accept-version moves `work_order_mark.bom_assembly_id` to the new revision but does not update `mo_assembly_line` (only MO bom-link does, `:819`). After a WO-level accept, that mark's chips go grey / "ยังไม่ออก WO" though WOs exist. Same rule pre-exists in `qcShortfalls` and `wo_remaining`; now more visible.
- fix_route: be (note / future).

### F-7 · Low (process) · CI not run
- Branch not pushed; CI must be green before staging merge (migration auto-applies to the single shared Supabase DB).
- fix_route: devops.

## Edge cases checked OK
- plan_finish null → no timeliness check (FE + BE). plan_finish is timestamptz instant, so no date-only midnight trap.
- All 3 `resolveActuals` call sites (Complete no-marks, Complete with marks, edit-after-DONE) pass `wo.plan_finish`.
- `mo_breakdown` → `wo_breakdown`: no remaining consumers; `allocation_breakdown` kept for MO create.
- Mark split across WOs of one op: chips sum QC across WOs, green only when all DONE and sum ≥ need; unit-tested only.
- QC dropped below Quantity → finish cleared to null and logged in history.
