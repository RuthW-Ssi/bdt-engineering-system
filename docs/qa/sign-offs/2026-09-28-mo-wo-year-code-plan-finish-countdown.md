# QA Sign-off — MO/WO Year-Prefix Code Format + Plan Finish Countdown

- **feature:** MO/WO code format change (MO-NNNNN/WO-NNNNNNNN flat global
  counters → MO-YYNNNNNN/WO-YYNNNNNN year-prefixed per-year counters, plus a
  full renumber of existing data) · new "days remaining until Plan Finish"
  countdown badge (frontend-only, 5 UI surfaces)
- **branch:** `dev-t-wo-multimark-team-qc` (uncommitted working tree —
  pre-commit review, per explicit task framing)
- **scope:** 12 files (5 Group 1 [1 new migration] + 7 Group 2 [2 new]),
  per the explicit review request; everything else in `git status` is out
  of scope (stray/WIP noise) and was not reviewed
- **date:** 2026-09-28
- **qa decision:** ~~BLOCK~~ → **PASS** (revised same day, both blockers fixed
  — see "Revision" section below)
- **approved_for_ship:** true
- **user_overrode:** false — not an override; both BLOCKing conditions were
  actually fixed and re-verified, not bypassed

## Revision (same day, after initial BLOCK)

Both High findings fixed:

1. **QA-F-001** — `seed-mo.ts`/`seed-wo.ts`'s `nextMoCode()`/`nextWoCode()`
   rewritten to the same `(year, next_val)` atomic-upsert shape as the real
   generators, format `MO-YYNNNNNN`/`WO-YYNNNNNN`. `seed-mo.ts`'s
   idempotency check (previously `mo_code: 'MO-00001'`, guaranteed stale
   post-renumber) changed to a `create_uid`-based count instead of a
   hardcoded old-format code string. **Note:** `seed-wo.ts` has a separate,
   much larger pre-existing breakage independent of this fix — it still
   writes `work_order.create()` fields (`bom_assembly_id`,
   `earliest_start_at`, etc.) that the 2026-09-17 multi-mark WO redesign
   removed from that model entirely. Only the code-generator helper was
   fixed here; `pnpm seed:wo` still will not run end-to-end until that
   separate, unrelated gap is closed — documented in the script's own
   comment, out of scope for this task.
2. **QA-F-002** — `daysUntil()` now normalizes the target date to local
   midnight too, matching `today`, before diffing — same fix point QA
   itself identified. Regression-tested directly (see QA-F-004 below):
   `daysUntil('2026-09-27T20:00:00')` against a fixed "now" of
   `2026-09-28T15:00:00` now correctly returns `-1` ("1D overdue"), not
   `0` ("today").

Both Medium findings also closed while in the area:

3. **QA-F-003** — added `backend/src/modules/manufacturing-orders/mo-code.generator.spec.ts`
   (5 tests: first-of-year code, digit padding, year rollover, tx-reuse vs
   own-transaction paths), mirroring `product-code.generator.spec.ts`'s
   existing mock shape.
4. **QA-F-004** — added `src/lib/dateMath.test.ts` (10 tests covering
   `daysUntil`/`daysRemainingLabel`, using `vi.useFakeTimers()` to fix
   "now" so results are deterministic) — includes the exact QA-F-002
   regression case as its own named test.

QA-F-005 (stale header comments) fixed too — `schema.prisma`'s
`mo_code_seq`/`work_order_code_seq` doc comments no longer say "SELECT FOR
UPDATE"/old format.

Re-verified per this file's own "Unblock path" step 4:
- `tsc -b` both backend and frontend — clean, 0 errors.
- Full `pnpm jest` re-run (backend) — 184/184 passing on the touched
  suites (`mo-code.generator.spec.ts` new, `manufacturing-orders.service.spec.ts`,
  `wo-auto-create.service.spec.ts`, plus mo-print's own suites); full-repo
  re-run still 903/920 with the same 4 pre-existing/unrelated failures as
  the documented baseline, no new ones.
- Full `pnpm test` re-run (frontend, Vitest) — 139/139 passing (129
  pre-existing + 10 new `dateMath.test.ts`).
- Live re-verification via Playwright against the running dev app: MO/WO
  codes render as `MO-26000001`/`WO-26000001..3` everywhere (MoDetail,
  WoDetail, MoList, WoList, WorkOrdersTab); the Plan Finish countdown
  badge correctly changed from the old buggy "2D" to the fixed "1D" after
  the QA-F-002 fix, confirming the rounding change took effect for real,
  not just in the unit tests.

QA-F-006 (timezone dependency) and QA-F-007 (wiki test summary gap) remain
open as documented follow-ups — both were already WARN/INFO, not
blocking, per the original review.

## Why BLOCK

Two independent High findings, either one sufficient on its own:

1. **QA-F-001** — `backend/prisma/seed-mo.ts`/`seed-wo.ts` (wired to real
   `pnpm seed:mo`/`pnpm seed:wo` scripts) still reference the pre-migration
   `mo_code_seq.id`/`work_order_code_seq.id` columns. The reviewed migration
   renames both to `year`. After this ships, both seed scripts throw a
   Postgres `column "id" does not exist` error the first time they try to
   allocate a code — a guaranteed, 100%-reproducible break of a documented
   dev tool, caused directly by the schema change under review. Not in the
   reviewer's listed file scope, but a direct, confirmed consequence of it.
2. **QA-F-002** — the new shared `daysUntil()`/`daysRemainingLabel()`
   (`src/lib/dateMath.ts`), wired into all 5 new UI surfaces, normalizes
   only "today" to midnight before diffing against the target
   `plan_start`/`plan_finish` timestamp (which legitimately carries a real
   time-of-day, per `@db.Timestamptz` + `WoDetail.tsx`'s own
   `fmtDateTime` usage on the same field). Traced by hand with concrete
   timestamps: a `plan_finish` from **yesterday evening** (already
   overdue) can render as **"today"** instead of **"X D overdue"** — the
   failure direction that matters most for a production-tracking signal,
   reading exactly backwards. This is the core value proposition of the
   feature under review.

**This is not a rejection of the engineering work as a whole.** Everything
this pass could independently verify — the renumbering SQL's
`ROW_NUMBER()` partition/order logic, the atomic-upsert generator's race
safety (both for an existing year and a brand-new one), the migration's
correct behavior against a fresh/empty database (e.g. staging today), and
the plain wiring of `DaysRemainingBadge` into 4 already-existing display
surfaces plus the new WorkOrdersTab grid column — traced correct by hand
and confirmed via a fresh `tsc -b` + full backend/frontend test-suite
re-run (no new failures; suite counts match this branch's own same-day
baseline exactly). See findings file for the full migration-safety trace.
Both BLOCKing findings are narrowly scoped and each has a small, mechanical
fix.

## checks_performed

See `docs/qa/findings/2026-09-28-mo-wo-year-code-plan-finish-countdown.md`
for the full 10-item checklist table with evidence per row. Summary:

| # | check | result |
|---|---|---|
| 1 | Notion DoD | n/a — no DoD exists yet for this backfill-sprint slice |
| 2 | Wiki test summary exists | **gap** (QA-F-007, WARN per same-branch same-day precedent) |
| 3 | Wiki summary DoD coverage | n/a (blocked by #2) |
| 4 | Raw test report | n/a — this findings file + fresh re-run stand in |
| 5 | Backend coverage on changed files | gap (QA-F-003: `MoCodeGenerator`, zero coverage) |
| 6 | CI green | n/a — nothing pushed yet; local typecheck + full test suites re-run fresh instead, all pass except the 4 known pre-existing/unrelated suites |
| 7 | Wiki diff present | same gap as #2 |
| 8 | Manual test evidence | not supplied to this review |
| 9 | Smoke test | n/a — no Playwright coverage for this feature set |
| 10 | No active security BLOCK | not applicable — `security` was not dispatched for this review request (scoped to `qa` only) |

## findings

Full detail in `docs/qa/findings/2026-09-28-mo-wo-year-code-plan-finish-countdown.md`:

- **QA-F-001** (High→BLOCK) — `seed-mo.ts`/`seed-wo.ts` break after this
  migration ships (still reference the renamed `id` column)
- **QA-F-002** (High→BLOCK) — `daysUntil()`/`daysRemainingLabel()` mislabel
  overdue items as "today" (and vice versa) because the target timestamp's
  time-of-day is never normalized away before diffing
- **QA-F-003** (Medium→WARN) — `MoCodeGenerator`'s rewritten atomic-upsert
  logic has zero unit test coverage
- **QA-F-004** (Medium→WARN) — new `dateMath.ts` pure functions have zero
  unit test coverage, against this repo's own established convention for
  exactly this kind of module (would likely have caught QA-F-002)
- **QA-F-005** (Low→INFO) — self-contradicting header comments left on
  `mo_code_seq`/`work_order_code_seq` in `schema.prisma`
- **QA-F-006** (Low→INFO) — year-boundary computation depends on the DB
  and app-server timezones agreeing; worth confirming, not a found bug
- **QA-F-007** (Medium→WARN, downgraded per same-branch precedent) — no
  wiki test summary for this slice

Plus one informational note (not a finding): the new WorkOrdersTab Plan
Finish column does **not** need its own dedicated test, per this repo's
own established convention of unit-testing only a page's extracted pure
functions, never rendering the page itself — the actionable gap is
QA-F-004 (`dateMath.ts` itself), not the JSX that consumes it.

## Unblock path

1. **Required (QA-F-001):** update `nextMoCode()`/`nextWoCode()` in
   `backend/prisma/seed-mo.ts`/`seed-wo.ts` to the new per-year `(year,
   next_val)` shape and `MO-YYNNNNNN`/`WO-YYNNNNNN` format.
2. **Required (QA-F-002):** in `src/lib/dateMath.ts`'s `daysUntil()`,
   normalize the target date (`d`) to local midnight the same way `today`
   already is, before diffing — this fixes every one of the 5 new
   surfaces plus `AssemblyPicker.tsx`'s pre-existing `zone_end_date` usage
   in one place.
3. **Strongly recommended before/alongside the same commit:** QA-F-003 +
   QA-F-004 (add the two missing unit-test files) — QA-F-004 in particular
   would have caught QA-F-002 mechanically rather than by manual trace.
4. Once 1-2 are fixed, re-run this pass's own re-verification steps
   (`tsc -b` both sides, the two targeted spec files, full backend +
   frontend suites, plus a manual re-trace of the dateMath boundary cases
   from QA-F-002) to confirm the fixes, then this sign-off can be revised
   to PASS/WARN without redoing the full migration trace.

## Note on Notion / log.md audit trail

Per `qa.md`'s Definition-of-Done, a BLOCK verdict is returned immediately
without waiting — Notion task update and
`~/Documents/bdt/knowledge-base/log.md` audit entries are the release-gate
orchestrator's job on a PASS/WARN outcome, not this review's. Not
performed here since the verdict is BLOCK.
