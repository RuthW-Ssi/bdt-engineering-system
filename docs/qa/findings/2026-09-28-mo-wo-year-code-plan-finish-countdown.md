# QA Findings — MO/WO Year-Prefix Code Format + Plan Finish Countdown

- **Scope:** pre-commit review of an uncommitted working tree on
  `dev-t-wo-multimark-team-qc`, reviewing ONLY the 2 explicitly in-scope
  groups — Group 1 (5 files: MO/WO code format MO-NNNNN/WO-NNNNNNNN →
  MO-YYNNNNNN/WO-YYNNNNNN year-prefixed per-year counters, + a full renumber
  migration) and Group 2 (7 files, 2 new: "days remaining until Plan Finish"
  countdown badge, frontend-only). Everything else in `git status` is
  out of scope (unrelated stray/WIP noise per task framing) and was not
  reviewed.
- **Reviewer:** `qa` role (release-readiness reviewer, review-only, per
  `wiki/tech/roles/qa.md` + `_operating-contract.md`).
- **Date:** 2026-09-28.
- **Nothing committed** — read-only review; no files staged/modified.

Method: read every diff (`git diff -- <path>`) plus `Read` on the new
untracked files (migration.sql, dateMath.ts, DaysRemainingBadge.tsx); traced
the renumbering SQL and the atomic-upsert generator logic by hand (row
values, race-window analysis, fresh/empty-DB behavior) rather than trusting
the diff's own comments; traced the frontend countdown math by hand against
concrete date/time examples; grepped for every other file in the repo that
touches `mo_code_seq`/`work_order_code_seq` to check for fallout beyond the
listed diff; ran `npx tsc -b` (both BE + FE, clean) and the full backend
`npx jest` + frontend `npx vitest run` suites fresh (pre-commit, nothing
pushed, no CI run to trust yet); checked `wiki/tech/testing/per-feature/`
and the Notion snapshot mirror for existing DoD/test-coverage docs.

---

## Checklist (per `qa.md`'s 10-item BDT release-readiness table)

| # | check | result |
|---|---|---|
| 1 | Notion task DoD all checked | **n/a** — same backfill-sprint situation as this branch's own same-day prior QA pass (`docs/qa/sign-offs/2026-09-28-s36-leftovers-op-icon-print-r4.md`'s checks_performed #1): no `pm/_snapshots/sprint-36.md` exists yet, no per-task DoD found for this slice. Not fabricated. |
| 2 | Wiki test summary exists (`wiki/tech/testing/per-feature/<feature>.md`) | **gap — QA-F-007.** No entry for this year-code renumber or the Plan-Finish-countdown feature. `wiki/tech/testing/per-feature/mo.md`/`wo.md` predate this slice and were not updated. |
| 3 | Wiki summary DoD coverage map = 100% PASS | n/a (blocked by #2) |
| 4 | Raw test report exists with current date | n/a — no `docs/test-scripts/<feature>/` report for this slice; this findings file + fresh test re-run below stand in |
| 5 | Backend coverage on changed files (90% svc / 80% ctrl) | **gap — QA-F-003** (MoCodeGenerator has zero coverage); wo-auto-create.service.spec.ts's own inlined equivalent IS updated/covered |
| 6 | CI on branch is green | **n/a** — nothing committed/pushed yet; `gh run list --branch dev-t-wo-multimark-team-qc` returns no runs. Ran the equivalent checks locally instead (typecheck + full suites, see below) |
| 7 | Wiki diff present for changed area | same gap as #2 |
| 8 | Manual test evidence (user-provided) | **not present in this review's context** — no screenshots/scenario list supplied to this pass |
| 9 | Smoke test (Playwright) | n/a — no Playwright suite covers MO/WO code allocation or this countdown badge |
| 10 | No active BLOCK from security subagent | not dispatched in parallel for this review request (task scoped this review to QA only); no security findings file exists for this date+slug to cross-reference |

---

## QA-specific findings

### QA-F-001 (High → BLOCK) — `seed-mo.ts`/`seed-wo.ts` break after this migration ships (column rename fallout, outside the listed diff but caused by it)

- **where:** `backend/prisma/seed-mo.ts:13-17` (`nextMoCode()`) and
  `backend/prisma/seed-wo.ts:6-10` (`nextWoCode()`) — wired to real npm
  scripts `pnpm seed:mo` / `pnpm seed:wo` (`backend/package.json:24-25`).
  Not in the reviewer's listed scope, but directly broken by
  `backend/prisma/schema.prisma`'s reviewed PK rename.
- **what:** Both scripts still do
  `INSERT INTO mo_code_seq (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`
  and `SELECT next_val FROM mo_code_seq WHERE id = 1 FOR UPDATE` (same
  pattern for `work_order_code_seq`) — the exact pre-refactor shape. The
  reviewed migration (`20260928110000_mo_wo_code_year_prefix/migration.sql`)
  renames both tables' `id` column to `year`. After this ships, running
  either seed script throws a Postgres error (`column "id" does not
  exist`) the very first time it tries to allocate a code — a guaranteed,
  100%-reproducible break, not a theoretical one. This is also the primary
  local-dev tool for populating a fresh DB with sample MOs/WOs, i.e. exactly
  the workflow someone would reach for to manually verify this feature
  end-to-end on a fresh database.
- **severity:** High — confirmed, reproducible break of a documented,
  wired-in dev tool, caused directly by the schema change under review.
  Not caught by any automated check (these are standalone `ts-node` scripts,
  not covered by `jest`/`vitest`).
- **evidence:**
  ```
  backend/prisma/seed-mo.ts:13: INSERT INTO mo_code_seq (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING
  backend/prisma/seed-mo.ts:14: SELECT next_val FROM mo_code_seq WHERE id = 1 FOR UPDATE
  backend/prisma/seed-wo.ts:6:  INSERT INTO work_order_code_seq (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING
  backend/prisma/seed-wo.ts:7:  SELECT next_val FROM work_order_code_seq WHERE id = 1 FOR UPDATE
  ```
  Migration: `ALTER TABLE "mo_code_seq" RENAME COLUMN "id" TO "year";` /
  same for `work_order_code_seq`.
- **fix_route:** data/be — update `nextMoCode()`/`nextWoCode()` to the new
  per-year `(year, next_val)` shape (mirroring the real generators' atomic
  upsert, or at minimum the new column name + `MO-YYNNNNNN`/`WO-YYNNNNNN`
  format) before this ships, so `pnpm seed:mo`/`pnpm seed:wo` keep working.

### QA-F-002 (High → BLOCK) — shared `daysUntil()`/`daysRemainingLabel()` mislabel "today" vs "overdue" vs "N days" because the target date's time-of-day is never normalized away

- **where:** `src/lib/dateMath.ts:6-12` (`daysUntil`) and `:14-26`
  (`daysRemainingLabel`) — consumed by the new `DaysRemainingBadge`, wired
  into 5 surfaces: `MoDetail.tsx` (Overview card + the new WorkOrdersTab
  Plan Finish column), `WoDetail.tsx` (Execution card), `WoList.tsx`,
  `MoList.tsx`.
- **what:** `daysUntil()` normalizes **only** `today` to local midnight
  (`today.setHours(0,0,0,0)`) before diffing against `d = new
  Date(dateStr)`, which keeps its full time-of-day. `plan_start`/
  `plan_finish` are `@db.Timestamptz` fields that legitimately carry a
  real time component (confirmed: `WoDetail.tsx`'s own `Row` for the same
  field uses `fmtDateTime`, not a date-only formatter — the schema
  comments call out "logged to the minute"). Traced by hand with concrete
  timestamps (today's date = 2026-09-28 per the session clock):
  - A `plan_finish` of **today, 09:00** → diff = 9h / 24h = 0.375 →
    `Math.ceil(0.375) = 1` → shows **"1D"** instead of **"today"**.
  - A `plan_finish` of **yesterday, 20:00** (already 4h into being overdue
    as of local midnight) → diff = -4h / 24h = -0.1667 →
    `Math.ceil(-0.1667) = -0` (i.e. `0`) → `isOverdue` (`days < 0`) is
    **false** and `isToday` (`days === 0`) is **true** → shows **"today"**
    instead of **"X D overdue"**. This is the more serious direction: a
    work order that's already late reads as merely due today.
  - Only a `plan_finish` at exactly local midnight avoids the skew.
  This logic is **not new** — it's a verbatim copy of
  `AssemblyPicker.tsx`'s pre-existing local `daysUntil()`/`ItemDateBadge`
  (used there for `zone_end_date`, apparently a date-only field in
  practice) — but this diff is what extracts it into a shared module and
  wires it into 4 new, genuinely time-bearing fields
  (`plan_start`/`plan_finish` on both MO and WO) across 5 UI surfaces,
  materially increasing the bug's real-world blast radius and turning a
  latent quirk into a production-tracking signal that can read backwards.
- **severity:** High — this is the core value proposition of the exact
  feature under review (distinguish overdue / due-today / upcoming), and
  the failure direction that matters most (overdue reading as "today") is
  a materially misleading production-floor signal, not a cosmetic
  off-by-one.
- **evidence:** `daysUntil()`/`daysRemainingLabel()` source (quoted above,
  `src/lib/dateMath.ts`); byte-identical prior logic at
  `src/components/mo/AssemblyPicker.tsx`'s pre-diff `daysUntil()` +
  `ItemDateBadge` (confirmed via `git diff` — the extraction is a pure
  move, no logic change).
- **fix_route:** fe — normalize `d` to local midnight the same way `today`
  already is (`d.setHours(0,0,0,0)`) before diffing, then the division is
  exact (no `Math.ceil` skew needed, or keep it for safety since the
  result is now always an integer number of days). Apply once in
  `daysUntil()` — every consumer (including `AssemblyPicker`'s
  pre-existing `zone_end_date` usage) benefits automatically.

### QA-F-003 (Medium → WARN) — `MoCodeGenerator`'s rewritten atomic-upsert + year-prefix logic has zero unit test coverage

- **where:** `backend/src/modules/manufacturing-orders/mo-code.generator.ts`
  — no `mo-code.generator.spec.ts` exists (confirmed: no such file in the
  module directory) and it never has, even pre-refactor. The one spec that
  touches the module that calls it,
  `manufacturing-orders.service.spec.ts`, stubs `codeGen` as `{} as any`
  (line 80) and no test in that file exercises the `create()` MO path that
  calls `this.codeGen.generate(tx)` at all.
- **what:** This diff entirely rewrites the SQL (SELECT FOR UPDATE +
  UPDATE → a single `INSERT ... ON CONFLICT ... RETURNING` upsert) and the
  code format (flat 5-digit global counter → 2-digit-year + 6-digit
  per-year counter) — genuinely new, correctness-sensitive logic (race
  safety, year rollover, fresh-year seeding) that ships with no automated
  check anywhere. Contrast with `WorkOrderAutoCreateService`'s equivalent
  inlined logic, which DOES have its mocked-shape assertions updated in
  `wo-auto-create.service.spec.ts` (`{ allocated: 900 }`, the computed
  `expectedCode`, etc.) — `MoCodeGenerator` has no analogous test at all,
  updated or otherwise.
- **severity:** Medium — hand-tracing (see main review notes / sign-off)
  found the SQL to be correct, but "traced it by hand and believe it" is
  exactly what a unit test exists to replace, especially for a
  from-scratch SQL rewrite.
- **fix_route:** tester/be — add `mo-code.generator.spec.ts`: mock
  `tx.$queryRaw` to return `[{ allocated: N }]` and assert the returned
  string is `MO-` + current 2-digit year + `N` zero-padded to 6; assert the
  SQL text passed to `$queryRaw` targets `mo_code_seq` (a template-literal
  smoke check, since the actual upsert semantics can only be proven against
  a real Postgres instance).

### QA-F-004 (Medium → WARN) — new `src/lib/dateMath.ts` pure functions have zero unit test coverage, despite matching this repo's own established convention for exactly this kind of module

- **where:** `src/lib/dateMath.ts` (`daysUntil`, `daysRemainingLabel`) — no
  `dateMath.test.ts` exists.
- **what:** This repo has an explicit, repeatedly-applied convention for
  testing pages/components: don't render/mount the page (react-router
  params, hooks, etc.) — instead extract the one bit of new **pure** logic
  and unit-test it directly. Both `WoDetail.test.ts` ("same 'extract and
  test the pure piece' precedent...") and `WoList.test.ts` say this
  explicitly in their own header comments, and do exactly that for
  `buildDoneMarksPayload`/`clampQtyEdit`/`formatMarks`. `dateMath.ts` is
  precisely this kind of module — pure, exported, used by 5 pages — and is
  the one new pure-logic unit this diff added, yet it shipped with no
  spec. A `daysUntil.test.ts`/`dateMath.test.ts` written to this repo's own
  standard (concrete date fixtures, boundary cases) would very likely have
  caught QA-F-002 above directly.
- **severity:** Medium — no coverage-threshold breach in the strict sense
  (this is a brand-new file, not a regression in measured %), but it is a
  real, avoidable process gap against this repo's own stated precedent.
- **evidence:** `src/pages/WoDetail.test.ts:5-12`, `src/pages/WoList.test.ts:3-7`
  (scope-note comments); `find src -iname "*.test.ts*"` — no `dateMath`
  or `DaysRemainingBadge` entry.
- **fix_route:** tester/fe — add `src/lib/dateMath.test.ts` covering: null
  input → null; a date today at midnight → `days === 0`/"today"; a date
  today with a non-midnight time (the QA-F-002 boundary case); a date
  yesterday evening (the overdue-boundary case); a date 31/30/29 days out
  (the `isUrgent` threshold); a date in the past by several days
  ("N D overdue").

### QA-F-005 (Low → INFO) — self-contradicting header comments left on `mo_code_seq`/`work_order_code_seq` in `schema.prisma`

- **where:** `backend/prisma/schema.prisma:1532` (`// 🟥 Custom: mo_code_seq
  (MO-NNNNN counter · SELECT FOR UPDATE, P5)`) and `:1683` (same for
  `work_order_code_seq`, `WO-NNNNNNNN ... SELECT FOR UPDATE`) — both left
  untouched by this diff, directly above the two NEW lines this diff added
  immediately below them describing the real (now-different) mechanism and
  format.
- **what:** The un-updated line still names the old flat format and the
  old SELECT-FOR-UPDATE mechanism, contradicting the new lines right below
  it in the same comment block ("One row per year ... code format is
  MO-YYNNNNNN"). Not misleading enough to cause a bug, but confusing to
  the next reader and a textbook case of the doc-drift this role card
  flags as "future contradiction" material.
- **severity:** Low.
- **fix_route:** be — update both header lines to match the new format/
  mechanism (or delete them now that the fuller replacement lines exist
  immediately below).

### QA-F-006 (Low → INFO) — year-boundary computation depends on the DB session timezone and the Node process timezone agreeing

- **where:** migration `20260928110000_mo_wo_code_year_prefix/migration.sql`
  uses `EXTRACT(YEAR FROM create_date)` (Postgres session timezone) to
  decide which year an *existing* row belongs to; `mo-code.generator.ts`/
  `wo-auto-create.service.ts` use `new Date().getFullYear() % 100` (Node
  process timezone) to decide the year for a *new* code. Both need to
  agree on "what year is it right now" for codes to stay chronologically
  sane across a Dec 31 / Jan 1 boundary.
- **what:** If the Cloud Run backend and the Postgres/Supabase session run
  under different timezones (e.g. one UTC, one Asia/Bangkok, UTC+7), a
  code allocated a few hours either side of midnight UTC on New Year's Eve
  could disagree with which year a same-instant row would have been
  bucketed into by this migration, had it run then. Purely theoretical
  today (this migration only runs once, at deploy time, against already-
  existing data) — relevant going forward for how consistently the
  generator's own year rolls over each Dec 31/Jan 1 relative to the
  business's real calendar day in Thailand.
- **severity:** Low — no bug found, just worth confirming both run in the
  same (or an intentionally-chosen) timezone.
- **fix_route:** devops/be — confirm/document the Cloud Run service's `TZ`
  and Postgres/Supabase's session timezone; not blocking.

### QA-F-007 (Medium → WARN, downgraded per same-branch precedent) — no wiki test summary for this slice

- **where:** `wiki/tech/testing/per-feature/` (knowledge-base) — no entry
  for the MO/WO year-code renumber or the Plan-Finish-countdown feature.
- **what:** Per `qa.md`'s default rule this would normally BLOCK
  ("If wiki summary missing → BLOCK + route to tester"). Downgraded to
  WARN here for the same reason this branch's own same-day prior QA pass
  used (`docs/qa/sign-offs/2026-09-28-s36-leftovers-op-icon-print-r4.md`,
  QA-F-001): no Notion task DoD exists yet for this backfill-sprint slice
  to check the wiki summary against, and this pass independently verified
  the code by direct reading + hand-tracing + a fresh full test-suite
  re-run rather than trusting a handed-in artifact.
- **severity:** Medium, surfaced as WARN by precedent (not silently
  downgraded to Low).
- **evidence:** `ls wiki/tech/testing/per-feature/` — only `mo.md`/`wo.md`/
  `wo-visual-tab.md`/`user-module-permissions.md`, all predating this
  slice; no `sprint-36.md` in `pm/_snapshots/`.
- **fix_route:** tester — write or extend `wiki/tech/testing/per-feature/mo.md`/
  `wo.md` (or a new dedicated doc) covering the year-code format change and
  the countdown badge.

---

## Informational — does the new WorkOrdersTab Plan Finish column need its own test?

Answered explicitly per the task's request, not scored as a finding: **no,
not per this repo's own established convention.** `WoDetail.test.ts` and
`WoList.test.ts` both state outright that the page itself (react-router
params, data-fetching hooks, JSX rendering) is never mounted/rendered in
this repo's Vitest suite — only a page's exported **pure** functions are
unit-tested. `MoDetail.tsx`'s new grid cell
(`<span>{fmtDate(wo.plan_finish)}</span><DaysRemainingBadge
planFinish={wo.plan_finish} />`) introduces no new pure function of its
own — it's JSX composition of two already-covered/reviewed pieces
(`fmtDate`, which is pre-existing and unchanged, and `DaysRemainingBadge`,
which delegates entirely to `dateMath.ts`). The real, actionable gap is
QA-F-004 above (`dateMath.ts` itself untested) — once that's covered, the
grid column's correctness follows from it, consistent with precedent.

---

## Migration safety — independently confirmed clean (traced by hand)

`backend/prisma/migrations/20260928110000_mo_wo_code_year_prefix/migration.sql`:

| Step | What it does | Verified |
|---|---|---|
| Renumber `manufacturing_order.mo_code` | `ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM create_date) ORDER BY create_date ASC)`, formatted `MO-YYNNNNNN` | Correct — partitioning by year + ordering by create_date preserves relative chronological order within each year exactly; `rn` is a strict per-partition sequence starting at 1, so no gaps/dupes. New format's digit width (8 digits after `MO-`) never collides with the old 5-digit format during the single `UPDATE` (Postgres checks the unique index per-row as the statement proceeds; new values are structurally distinct from every old value regardless of update order). |
| Renumber `work_order.wo_code` | Same pattern, keyed off `created_at` | Correct, same reasoning. |
| `mo_code_seq`: `id` → `year` PK + reseed | `DELETE FROM` then `INSERT ... SELECT year, COUNT(*)+1 ... GROUP BY 1` | Correct — `COUNT(*)` per year equals `MAX(rn)` for that year (the renumber assigns `rn` 1..count with no gaps), so `next_val = count + 1` continues exactly where the renumber left off, with no gap or collision for the next real MO of that year. |
| Same for `work_order_code_seq` | | Correct, same reasoning. |
| **Fresh/empty DB (0 rows) — e.g. staging today** | `INSERT ... SELECT ... GROUP BY 1` against an empty `manufacturing_order`/`work_order` table returns 0 rows → `mo_code_seq`/`work_order_code_seq` end this migration completely empty (0 rows, not even a placeholder) | Correct and intentional — the migration's own comment says so, and it was independently re-derived: the generator's `INSERT ... ON CONFLICT (year) DO UPDATE ... RETURNING` for a year with no row does a plain insert (`next_val` literal `2`, `RETURNING next_val - 1` = `1`), producing `MO-26000001`/`WO-26000001` correctly as the very first code of the year with no pre-seeded row required. |

**Atomic-upsert race-safety (`mo-code.generator.ts` / `wo-auto-create.service.ts`)** —
traced by hand against Postgres's documented `INSERT ... ON CONFLICT DO
UPDATE` concurrency behavior:
- Two concurrent transactions racing for the **same existing** year: the
  second blocks on the unique-index row lock until the first
  commits/rolls back, then re-evaluates `next_val = next_val + 1` against
  the post-commit value — genuinely serialized, no double-allocation.
  Strictly safer than the old `SELECT ... FOR UPDATE` + separate `UPDATE`
  (fewer round trips, same guarantee).
- Two concurrent transactions racing for a **brand-new** year (no row
  yet): one succeeds as a plain `INSERT`; the other hits the unique
  violation, waits, then goes through the `DO UPDATE` branch using the
  first transaction's now-committed row — correctly gets the *next*
  value, not a duplicate. This is exactly the race the old code could
  not have handled safely without a pre-seeded row (which the migration
  comment already calls out) — genuinely safer than before, not just
  differently safe. If the first transaction instead rolls back, the
  second's own `INSERT` proceeds normally (no lingering row) — same
  gap-on-rollback behavior the old counter already had, not a regression.
- Both statements run inside the same `tx` passed in from the MO/WO
  creation transaction, same as before — allocation rolls back with the
  rest of the transaction on failure, unchanged behavior.

**Conclusion: the migration and the generator rewrite are correct**,
including on a fresh/empty database. The two BLOCKing findings above
(QA-F-001, QA-F-002) are both about code *outside* this core SQL/logic —
a stale seed script and a frontend date-math bug — not about the
renumbering or the upsert itself.

---

## Regression check — fresh run (not trusted from any prior claim)

- `cd backend && npx tsc -b` — clean, 0 errors.
- `npx tsc -b` (frontend, repo root) — clean, 0 errors.
- Targeted: `npx jest src/modules/work-orders/wo-auto-create.service.spec.ts src/modules/manufacturing-orders/manufacturing-orders.service.spec.ts` — **67/67 pass** (confirms the updated mocks/assertions for the new `wo_code`/format are internally consistent and the create-MO path — mocked `codeGen` aside per QA-F-003 — has no regression).
- `cd backend && npx jest` (full suite) — **4 failed suites / 17 failed
  tests, 903 passed, 920 total.** Identical counts to this branch's own
  same-day prior QA pass (`docs/qa/sign-offs/2026-09-28-s36-leftovers-op-icon-print-r4.md`)
  and to the documented pre-existing baseline
  (`template-binding.service.spec.ts`, `cycle-time.service.spec.ts`,
  `bom-matching.service.spec.ts`, `project-progress.service.spec.ts` —
  none in this diff's file list). No new failure introduced.
- `npx vitest run` (frontend, full suite) — **14 files, 129 tests, 0
  failures.** Same file/test count as the same-day prior QA pass — i.e.
  confirms directly that **no new spec file was added** for `dateMath.ts`/
  `DaysRemainingBadge.tsx` (corroborates QA-F-004 by direct measurement,
  not just inspection).

---

## Cross-reference

- Same-branch, same-day prior QA pass (different slice):
  `docs/qa/sign-offs/2026-09-28-s36-leftovers-op-icon-print-r4.md` —
  precedent used above for downgrading the missing-wiki-summary check to
  WARN (QA-F-007) given this branch's backfill-sprint circumstances.
- No parallel `security` review was dispatched for this specific review
  request (task scoped this pass to `qa` only) — nothing to cross-reference
  for checklist item #10.
