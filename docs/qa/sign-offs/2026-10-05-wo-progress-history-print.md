# QA Sign-off — WO progress history (saved per mark, audited) + print drawing version

- **features:**
  1. **WO progress history.**
     - Per-mark progress is saved on Confirm through `PATCH /wo/:id/marks/:markId/progress` (orders:update, IN_PROGRESS/PAUSED). An atomic optimistic `expected` check returns 409 `STALE_PROGRESS`.
     - Every qty change is audited in `work_order_event.changes`: the new `PROGRESS_UPDATE` event, plus the Start seed, cancel, remove-mark, accept-version and legacy done.
     - `done()` without `marks` validates the saved values.
     - On the FE: bulk edit removed; ✎ refetches before seeding; history shows as a table inside the edit panel behind an icon toggle after Cancel; the Events tab shows the changes; the "Completion notes" field is removed.
     - Spec and plan: wiki `features/wo-progress-history-plan.md`.
  2. **Print drawing version (option A).**
     - The packet prints each mark's own newest PDF, so there is no more 409 when the zone's latest batch skipped the mark.
     - The drawing page label ends with "Drawing vN · dd/mm/yy" (TH "แบบ …"), which is also the watermark's third line.
     - The traveler shows a red note when a drawing was uploaded after the WO was created.
- **branch:** `dev-t-mo-wo-fixes`
- **date:** 2026-10-05
- **qa decision:** PASS (Low/INFO only). QA re-ran FE `src/components/wo` + `src/pages` (150/150) and BE work-orders + mo-print (409/409), and confirmed tsc clean on both sides. Both decision tables (wiki `tech/testing/per-feature/wo.md` 2026-10-05 increment and `mo-print-drawing-version.md`) map to real, passing tests.
- **security decision:** PASS (Low/INFO only).
  - JwtAuthGuard + PermissionGuard + `orders:update` are on the new route.
  - BOLA is checked twice: the mark is loaded via the WO, and the write's WHERE has id + work_order_id + removed_at.
  - Every field is validated, including nested `expected` (IsDefined/IsObject).
  - Mass assignment is impossible: only the six fixed fields are written, and `recorded_by` comes from the JWT.
  - The migration is additive and idempotent.
- **approved_for_ship:** true · **forced_ship:** false
- **migration:** `20261005000000_wo_progress_history` — `ALTER TYPE "WoEventType" ADD VALUE IF NOT EXISTS 'PROGRESS_UPDATE'` plus `ALTER TABLE work_order_event ADD COLUMN changes JSONB` (nullable, no default). Additive only, with no backfill and no data loss. It runs on the shared Supabase DB at the staging merge.
- **evidence:**
  - FE vitest 310/310; FE `tsc -b` clean.
  - BE work-orders + manufacturing-orders 452/452; BE `tsc --noEmit` clean.
  - Full BE jest has 17 failures, all in the 4 baseline suites (cycle-time, bom-matching, template-binding, project-progress), so the failing set did not grow.
  - Subagent-driven build in 4 units, each with a task review, then a whole-branch review, one fix wave (11 items) and a scoped re-review.
  - Live (local):
    - A throwaway WO passed 12/12 checks and was cancelled afterwards.
    - The user checked the edit panel and history UI in the browser through several iterations.
    - Print packet rendered and inspected (MO-26000001 / WO-IN-26000003, EN + TH), plus a probe traveler showing the updated-drawing note.
  - `/ponytail-review` was not run because the command is not available in this session.

## Deploy order (QA)
Merge staging → main only after **Prisma Migrate Deploy** and **Deploy Backend** on staging are both green:
- The new backend reads `changes` and writes `PROGRESS_UPDATE`.
- The new frontend needs the new PATCH route and a Complete call without marks.

The old frontend still works against the new backend, because legacy done(marks) is kept.

## Follow-ups (Low, not blocking)
- updateMarkProgress / done() without marks: move the WO status check and the saved-value checks inside the transaction (add `work_order.status` to the conditional `updateMany` WHERE; re-read the marks in the tx).
- Legacy done(marks): apply the QC Passed = Quantity gate and the qcBreakdownWrite blank=0 rule there too.
- DTO: add `@Max`/`maxDecimalPlaces(3)` so the audited values match the stored Decimal(12,3).
- QC disposition modals: pre-fill them with the saved values. This is a user decision; today a partial entry zeroes saved Rework/Renew, and the old value stays in `changes`.
- Traveler "updated drawing" note: cap it ("+N more") for WOs with many re-uploaded marks.
- Parked: a mark with Quantity 0 and blank QC can't reach Complete; `expected: {}` returns 409 instead of 400.
- Post-ship docs: `api.md` (PATCH route, optional done marks), `data-model.md` (`changes`, `PROGRESS_UPDATE`), `mo-print-packet.md` (newest-per-mark rule), spec §4 response shape (WoDetail); Notion Feature/Task rows.
