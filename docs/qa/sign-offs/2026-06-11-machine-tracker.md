# QA Sign-off — F-Machine-Tracker
_Date: 2026-06-11 · Branch: dev · Sprint 12 pilot_

## decision: BLOCK

## approved_for_ship: false

## user_overrode: false

---

## Checks performed

| # | Check | Target | Result |
|---|---|---|---|
| 1 | Notion task DoD all checked | 100% | NOT VERIFIED — no manual test evidence provided (F-04) |
| 2 | Wiki test summary exists | exists · current date | EXISTS — file present dated 2026-06-11 |
| 3 | Wiki summary DoD coverage map = 100% PASS | all ✅ | FAIL — all 32 rows "⏳ pending" (F-01) |
| 4 | Raw test report exists with current date | latest | FAIL — no machine-tracker report in docs/test-scripts/ (F-02) |
| 5 | Backend coverage on changed files | 90% svc · 80% ctrl | FAIL — 0 spec files · 0% coverage (F-03) |
| 6 | CI on branch is green | ✅ | UNVERIFIABLE — offline session (F-08) |
| 7 | Wiki diff for changed area | non-empty | DEFERRED — not checked; doc cascade is post-ship step |
| 8 | Manual test evidence (user-provided) | exists | FAIL — none provided (F-04) |
| 9 | Smoke test (if playwright exists) | all green | N/A — no playwright suite |
| 10 | No active BLOCK from security subagent | clear | N/A — security not co-dispatched in this run |

---

## findings

- [F-01 · HIGH] Wiki test summary all pending → `docs/qa/findings/2026-06-11-machine-tracker.md#f-01`
- [F-02 · HIGH] No raw test report → `docs/qa/findings/2026-06-11-machine-tracker.md#f-02`
- [F-03 · HIGH] No unit spec files, 0% coverage → `docs/qa/findings/2026-06-11-machine-tracker.md#f-03`
- [F-04 · HIGH] No manual test evidence → `docs/qa/findings/2026-06-11-machine-tracker.md#f-04`
- [F-05 · MEDIUM] Tab 4 missing inline "ปิด ticket" button → `docs/qa/findings/2026-06-11-machine-tracker.md#f-05`
- [F-06 · MEDIUM] `related_repair_id` never populated in status_history → `docs/qa/findings/2026-06-11-machine-tracker.md#f-06`
- [F-07 · MEDIUM] MulterError LIMIT_FILE_SIZE → 500 instead of 413 → `docs/qa/findings/2026-06-11-machine-tracker.md#f-07`
- [F-08 · MEDIUM] CI status not verifiable → `docs/qa/findings/2026-06-11-machine-tracker.md#f-08`
- [F-09 · LOW] MIME validation client-declared only → `docs/qa/findings/2026-06-11-machine-tracker.md#f-09`
- [F-10 · LOW] Seed hardcoded IDs 1/2 for maintenance_log upsert → `docs/qa/findings/2026-06-11-machine-tracker.md#f-10`

---

## BLOCK reason

Four High findings prevent ship:

1. **F-01**: Tester has not executed any tests — the wiki test summary is a pre-spec draft with all items "⏳ pending". No test execution has been recorded.
2. **F-02**: No raw test report file exists for this feature.
3. **F-03**: Zero `*.spec.ts` files in the machines module; backend coverage for this module is 0%.
4. **F-04**: No manual test evidence (screenshots or scenario walkthrough) has been provided by the user.

## Required before re-gate

To clear BLOCK, resolve in order:
1. **tester** — execute all test scenarios in `wiki/tech/testing/per-feature/machine-tracker.md`, fill Status column ✅/❌, write raw test report to `docs/test-scripts/machine-tracker/<date>-test-report.md`
2. **tester** — write unit tests for `machines.service.ts` and `repair-code.generator.ts` (≥90% svc coverage) and controller tests (≥80% ctrl coverage)
3. **user** — provide manual test evidence for happy path (PM log, open ticket, close ticket, suggest dialog, status change)
4. Confirm CI is green on `dev` branch
5. Medium findings F-05 and F-06 should also be addressed (inline close button + related_id wiring) before WARN acceptance
