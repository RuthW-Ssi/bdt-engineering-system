# QA Findings — S36 Leftovers + Operation Icon + MO Print Packet Round 4

- **Scope:** pre-commit review of an uncommitted working tree (176 changed
  paths in `git status`), reviewing ONLY the 3 explicitly in-scope groups —
  Group 1 (30 files: S36 schema/backend/frontend leftovers), Group 2 (8
  files, 4 new: Operation Icon feature), Group 3 (4 files: MO print packet
  round 4). Everything else in the working tree is out of scope (unrelated
  stray/WIP noise per task framing) and was not reviewed.
- **Reviewer:** `qa` role (release-readiness reviewer, review-only, per
  `wiki/tech/roles/qa.md` + `_operating-contract.md`).
- **Date:** 2026-09-28.
- **Nothing committed** — read-only review; no files staged/modified.

Method: read every diff (`git diff -- <path>` per file, plus `Read` on the 6
untracked new files) and traced logic by hand rather than trusting the
diff's own comments; ran `npx tsc -b` (both BE + FE, clean); ran the full
backend `npx jest` and frontend `npx vitest run` suites fresh (not trusted
from any prior claim, since nothing is committed and CI has not run yet);
checked the 4 new Prisma migrations for data-loss risk against a populated
table; checked `wiki/tech/testing/per-feature/` and Notion snapshot state
for existing DoD/test-coverage docs.

---

## Checklist (per `qa.md`'s 10-item BDT release-readiness table)

| # | check | result |
|---|---|---|
| 1 | Notion task DoD all checked | **n/a** — Sprint 36 ("Multi-Mark WO Lifecycle Hardening") was created retroactively 2026-09-24 as a backfill sprint; no `pm/_snapshots/sprint-36.md` exists yet and no per-task DoD was found for this specific slice of work (2026-09-24→29). Same situation as this branch's own prior QA pass (`docs/qa/sign-offs/2026-09-24-wo-multimark-team-qc.md`'s checks_performed #1). Not fabricated. |
| 2 | Wiki test summary exists (`wiki/tech/testing/per-feature/<feature>.md`) | **gap — QA-F-001.** No entry for `operation-icon`, `mo-print-packet`, `team-type`, `activity-operation-type`, or an `s36`-scoped doc. Existing `mo.md`/`wo.md`/`activity-library.md`/`operation-library.md` all predate this slice (dated 2026-06) and were not updated. |
| 3 | Wiki summary DoD coverage map = 100% PASS | n/a (blocked by #2) |
| 4 | Raw test report exists with current date | n/a — no `docs/test-scripts/<feature>/` report for this slice; this findings file + fresh test re-run below stand in |
| 5 | Backend coverage on changed files (90% svc / 80% ctrl) | **partial gap — QA-F-002/F-003/F-004** (see below); everything else touched has adequate coverage |
| 6 | CI on branch is green | **n/a** — nothing is committed/pushed yet (pre-commit review, as stated in the task); `gh run list --branch dev-t-wo-multimark-team-qc` returns no runs. Re-ran the equivalent checks locally instead (typecheck + full test suites, see below) |
| 7 | Wiki diff present for changed area | same gap as #2 — no wiki diff for this slice |
| 8 | Manual test evidence (user-provided) | **not present in this review's context** — no screenshots/scenario list were supplied to this pass. The PDF-builder comments throughout `mo-print-pdf-builder.ts` document an extensive live-iteration history with direct user quotes (e.g. "ลายน้ำที่เป็น icon ดูไม่รู้เรื่องเลย", "ทำให้ผิว qrcode กลืนเข้าไปในกรอบได้ไหม") that reads as real manual-test-and-fix cycling, but that is evidence found in code comments, not a scenario list/screenshot handed to this review — flagged, not treated as equivalent |
| 9 | Smoke test (Playwright) | n/a — no Playwright suite covers this feature set |
| 10 | No active BLOCK from security subagent | **FAILED — security returned BLOCK** (`docs/security/findings/2026-09-28-s36-leftovers-op-icon-print-r4.md`, same day, same scope). F-001 (High): `CreateOperationTemplateDto`/`UpdateOperationTemplateDto` in `backend/src/modules/routings/services/operation-template.service.ts:32-55` are plain TypeScript interfaces, not `class-validator`-decorated classes — confirmed by security via NestJS's own installed `ValidationPipe` source (`Object` is in the pipe's validation skip-list) — so **every field** on `POST/PATCH operation-templates`, including the new `icon` field this diff adds, has zero runtime validation. Re-read the current file directly as part of this pass (not just trusting security's finding) — confirmed still present, unresolved, no "Resolution" section appended to that findings file. **Per `qa.md`'s explicit rule, QA cannot lift a security BLOCK.** |

---

## QA-specific findings

### QA-F-001 (Medium → WARN) — missing wiki test summary for this slice

- **where:** `wiki/tech/testing/per-feature/` (knowledge-base)
- **what:** No per-feature test-coverage doc exists for any part of this
  diff's surface — operation icon picker, activity↔operation-type link,
  team type/headcount, WO cancel budget-release, MO print packet round 4.
- **severity:** Per `qa.md`'s own default rule this is normally an
  immediate BLOCK ("If wiki summary missing → BLOCK + route to tester").
  Downgraded to WARN here **for the same reason and by the same precedent**
  this branch's own prior QA pass used 4 days ago
  (`docs/qa/sign-offs/2026-09-24-wo-multimark-team-qc.md`'s F-002): no
  Notion task DoD exists yet for this backfill-sprint slice to check the
  wiki summary against in the first place, and this pass independently
  verified the code by direct reading + re-running the real test suites
  fresh rather than trusting a handed-in artifact — serving the same
  verification purpose the wiki summary exists to provide. This is *not* a
  silent downgrade to Low; it is surfaced as its own WARN per that same
  precedent, for a human to weigh explicitly.
- **evidence:** `ls wiki/tech/testing/per-feature/` — 18 entries, none
  dated after 2026-06-16 or scoped to this work; `ls
  pm/_snapshots/sprint-*.md` — no `sprint-36.md`.
- **fix_route:** tester — write `wiki/tech/testing/per-feature/mo-print-packet.md`
  (round 4 additions) and `operation-library.md` update (icon field,
  activity↔operation-type filter) at minimum. This findings file + the
  parallel security findings file can seed that write-up.

### QA-F-002 (Medium → WARN) — `getAssemblies(operationId)`'s new `wo_remaining` field has zero test coverage

- **where:** `backend/src/modules/manufacturing-orders/manufacturing-orders.service.ts`
  `getAssemblies()` (the new `operationId`-scoped `wo_remaining` computation,
  a `work_order_mark.aggregate` sum against sibling WOs of the same
  operation) — `backend/src/modules/manufacturing-orders/manufacturing-orders.service.spec.ts`
  has no `describe('...getAssemblies')` block at all (confirmed via grep —
  zero matches).
- **what:** New business logic (mark-budget-remaining-per-operation) shipped
  with no unit test — the diff to `manufacturing-orders.service.spec.ts`
  only touches `createWorkOrder()`-related describe blocks (team-lookup
  mock, headcount cap, auto-start revert). Traced the logic by hand instead
  (read carefully): `wo_remaining = max(0, line.qty - Σ qty_planned of
  non-removed marks on sibling WOs of the same mo_id+operation)` — this
  reads correctly against the schema and matches
  `WoAutoCreateService.computeMarkBudget()`'s documented-as-mirrored logic
  (the code comment explicitly flags it as a manually-kept-in-sync
  duplicate, which is itself worth a shared-helper follow-up, not just a
  test gap — noted but not separately scored).
- **severity:** Medium — logic reads correct on inspection and the file's
  own `tsc -b` + full describe-suite pass, but a "trace it by hand and
  believe it" verification is exactly what a unit test exists to replace;
  this is new numeric business logic (a budget subtraction with a
  `Math.max(0, …)` floor) that a wrong sign or off-by-one wouldn't
  necessarily surface elsewhere.
- **fix_route:** backend/tester — add a `getAssemblies` describe block:
  happy path (partial commitment → correct remainder), full commitment
  (`wo_remaining === 0`), no `operationId` passed (`wo_remaining === null`,
  unchanged legacy behavior), and a removed mark (soft-deleted via
  `removed_at`) correctly excluded from the committed sum.

### QA-F-003 (Medium → WARN) — `activities.service.ts`'s new `operation_type_id` filter/wiring has zero test coverage

- **where:** `backend/src/modules/activities/activities.service.ts`
  `findAll()`'s new `OR: [{ operation_type_id: null }, { operation_type_id
  }]` filter (an activity with no type set matches every filter value) plus
  the `create()`/`update()` passthrough of the field —
  `backend/src/modules/activities/activities.service.spec.ts` is **not
  touched by this diff at all** (confirmed: not in the file list, and
  `git diff` for it is empty). Re-ran it standalone (`npx jest
  activities.service.spec`) to confirm no regression — 10/10 pass — but
  that's the *old* test set, asserting nothing about the new field.
- **what:** The "NULL means usable for every type" semantics (the field's
  whole point, per its migration comment) is exactly the kind of subtle
  filter logic (`OR` with a `null` branch) that's easy to get backwards —
  worth a dedicated assertion, not just inspection.
- **severity:** Medium — same reasoning as QA-F-002 (new business logic,
  zero coverage, though inspection didn't turn up an actual bug — see main
  review notes below).
- **fix_route:** backend/tester — add cases to `activities.service.spec.ts`:
  `operation_type_id` filter matches both exact-type and type-less
  activities; omitting the filter returns all; create/update round-trip the
  field (including explicit `null`).

### QA-F-004 (Medium → WARN) — MO print packet round 4's new drawing logic has no dedicated test assertions

- **where:** `backend/src/modules/manufacturing-orders/mo-print/mo-print-pdf-builder.ts`
  (179-line diff: QR-center icon draw + module-snapping backing-plate math,
  watermark icon-after-text + icon-free-on-drawing-page rule, page "N /
  total" footer on every page, Team **Headcount** cell, Consume→
  **Consumable** / Code→**Name** column relabels, Activities table's new
  **Note** column) — `mo-print-pdf-builder.spec.ts`'s only change is adding
  `teamHeadcount`/`icon` to the mock row factory so the *existing* tests
  keep compiling; no new `it(...)` block asserts any of the above.
- **what:** This file's own established test convention (`decodedContentStream()`
  / `drawnGlyphCodes()` helpers, used throughout the existing suite to prove
  *exactly* what got drawn — e.g. "embeds a QR image on the traveler page,
  encoding the row's woUrl", "stamps a translucent two-line WO-code + mark
  watermark", "positions the corner label in the bottom-right") sets a high
  bar that this round's additions don't meet. Concretely untested:
  the icon actually appears (or the generic fallback draws when
  `row.icon` doesn't match a curated key), the watermark's icon is
  appended (not shown) on drawing pages per the 2026-09-28 narrowing, the
  page-count footer text is correct on every page including the drawing
  pages, and the headcount value actually renders.
- **severity:** Medium — read through the logic by hand (see main review
  below) and it is internally consistent and well-reasoned (the
  module-snapping parity math, the Y-flip/double-scale gotchas documented
  in `mo-print-icons.ts`'s comments read as genuine live-debugged fixes),
  but "well-commented and plausible" is not the same bar this file's own
  existing suite otherwise holds itself to.
- **fix_route:** backend/tester — add at minimum: a test asserting the
  fallback generic icon draws when `row.icon` is `null` or an unknown key
  (both the QR-center and watermark call sites), a test asserting the
  watermark carries no icon draw on the drawing page specifically (the
  `markCode` branch), and a test asserting `"N / <total>"` text appears on
  every page for a multi-row plan.

### QA-F-005 (Low → INFO) — headcount input allows non-integer values client-side

- **where:** `src/pages/MoDetail.tsx` `WoMarkPickerModal`'s headcount
  `<input type="number">` / `onHeadcountChange()`.
- **what:** `onHeadcountChange()` clamps to `[1, headcountMax]` but doesn't
  reject/round a fractional value (e.g. typing "2.5") — `Number.isFinite(2.5)`
  is `true`, so it passes through unclamped-to-integer. On submit this sends
  `team_headcount: 2.5` to a backend field validated `@IsInt() @Min(1)`
  (`create-wo.dto.ts`), which correctly 400s it — but the user sees a raw
  validation-error toast instead of the input silently rejecting/rounding
  the keystroke.
- **severity:** Low — no data-integrity risk (backend enforcement is
  correct and holds), UX polish only.
- **fix_route:** fe — round/reject non-integer input in
  `onHeadcountChange()`, same place the existing min/max clamp already
  lives.

### QA-F-006 (Low → INFO) — orphaned "add from library" hook/endpoint

- **where:** `src/hooks/useOperationTemplates.ts`'s `useAddFromLibrary()`
  and its backend counterpart `POST
  /operation-templates/:id/activities/from-library/:activityId`
  (`operation-templates.controller.ts` / `operation-template.service.ts`'s
  `addFromLibrary()`).
- **what:** `OperationBuilder.tsx`'s "+Add" flow was deliberately refactored
  in this diff (well-documented in its own comment, 2026-09-25 2nd
  revision) to stage picks locally instead of persisting immediately via
  this endpoint — fixing a real duplicate-row bug. `grep -rn
  useAddFromLibrary src/` confirms it is no longer called from anywhere.
  The backend endpoint is presumably still reachable (not deleted) but has
  no remaining frontend caller found in scope.
- **severity:** Low — dead code, not a behavioral bug; the backend route
  still works correctly if hit directly, it's just unreachable from the UI
  now.
- **fix_route:** fe (+ backend on a later pass) — remove the unused hook/API
  wrapper and consider whether the backend endpoint should be removed too,
  on next touch of this area. Not urgent.

### QA-F-007 (Low → INFO) — one extra API call per operation row to gate a button's visibility

- **where:** `src/pages/MoDetail.tsx` `CreateWorkOrderButton` (new
  component, renders once per operation row in `WorkOrdersTab`).
- **what:** Each instance calls `useMoAssemblies(moId, operationId)` purely
  to compute `fullyCommitted` and hide the button — for an MO with N
  operations, that's N separate `GET /mo/:id/assemblies?operation_id=X`
  requests just to render the tab, on top of whatever `WoMarkPickerModal`
  itself later fetches when opened.
- **severity:** Low — typical routing op counts in this system are small
  (structural routings tend to run 5-15 ops per the `mo.md`/`wo.md` wiki
  test summaries' seed data), so this is unlikely to be a real perf problem
  today, but it's worth naming before op counts grow.
- **fix_route:** fe — on a later pass, consider a single
  `GET /mo/:id/assemblies` (no `operation_id`) plus a client-side
  aggregation per operation, or a dedicated summary endpoint, instead of
  N per-operation queries.

---

## Migration safety — independently confirmed clean

Read all 4 new migration files in full, independently of security's own
Part 1 (same conclusion, cross-checked):

| Migration | Operation | Risk against a populated table |
|---|---|---|
| `20260924070000_add_activity_operation_type` | `ADD COLUMN activity.operation_type_id` (nullable FK, `ON DELETE SET NULL`) | None — nullable, no backfill needed |
| `20260925080000_add_team_type` | `ADD COLUMN team.team_type VARCHAR(20) NOT NULL DEFAULT 'external'` then `DROP DEFAULT` | None — Postgres backfills existing rows from the `DEFAULT` at `ADD COLUMN` time (fast, metadata-level since PG11+); comment honestly documents why `'external'` is the correct backfill value |
| `20260925090000_add_wo_team_headcount` | `ADD COLUMN work_order.team_headcount INTEGER NOT NULL DEFAULT 1` then `DROP DEFAULT` | None — same pattern; comment honestly flags `1` as a placeholder, not a claimed-accurate historical value |
| `20260929100000_add_operation_template_icon` | `ADD COLUMN operation_template.icon VARCHAR(40)` (nullable) | None |

All 4 are in correct chronological order in `backend/prisma/migrations/`
with no timestamp collisions against the existing sequence. No
`DROP COLUMN`/`DROP TABLE`/`RENAME` anywhere in this diff — the risk class
that drove the 2026-09-24 review's BLOCK (an unbackfilled `DROP COLUMN
due_date`) does not recur here. **Clean pass.**

---

## Regression check — fresh test re-run (not trusted from any prior claim)

- `cd backend && npx tsc -b` — clean, 0 errors.
- `npx tsc -b` (frontend, repo root) — clean, 0 errors.
- `cd backend && npx jest` (full suite) — **4 failed suites / 17 failed
  tests, 903 passed, 920 total.** All 4 failing suites
  (`template-binding.service.spec.ts`, `cycle-time.service.spec.ts`,
  `bom-matching.service.spec.ts`, `project-progress.service.spec.ts`) are
  **not in this diff's file list** and match this project's own documented
  pre-existing baseline exactly (`reference_daily_summary`/`bdt_project`
  memory: "on dev itself pnpm jest fails 17/674... Gate = failing set must
  not grow, not all green") — same 4 names, same 17-test count. No new
  failure introduced by this diff.
- Targeted re-run of every spec file actually touched by this diff
  (`machines.service.spec.ts`, `manufacturing-orders.service.spec.ts`,
  `work-orders.service.spec.ts`, `mo-print-pdf-builder.spec.ts`) — **145/145
  pass.**
- `activities.service.spec.ts` (untouched by diff, but its module *is*
  touched) — 10/10 pass, no regression.
- `npx vitest run` (frontend, full suite) — **14/14 files, 129/129 tests,
  0 failures.** Same file/test counts as the 2026-09-24 sign-off's own
  fresh re-run — consistent with no new frontend test files added in this
  slice.

---

## Cross-reference

- Security review, same day, same scope:
  `docs/security/findings/2026-09-28-s36-leftovers-op-icon-print-r4.md` —
  **BLOCK** (F-001, High: `operation-templates` create/update DTOs are
  unvalidated plain interfaces). This QA pass does not re-litigate that
  finding — see the sign-off file for how it's reflected in the overall
  verdict.
- Prior QA pass on this same branch (different, now-shipped slice):
  `docs/qa/sign-offs/2026-09-24-wo-multimark-team-qc.md` — precedent for
  handling a missing wiki test summary as WARN rather than an automatic
  BLOCK in this branch's backfill circumstances (used above for QA-F-001).
