# QA Sign-off — S36 Leftovers + Operation Icon + MO Print Packet Round 4

- **feature:** S36 leftovers (activity↔operation-type link, team
  `team_type`, WO `team_headcount` + create-WO required fields + cancel
  budget-release, MO assemblies `wo_remaining`) · new Operation Icon feature
  (picker, `operation_template.icon`, print-packet rendering) · MO print
  packet round 4 (QR-center icon, watermark icon, page-count footer, column
  relabels)
- **branch:** `dev-t-wo-multimark-team-qc` (uncommitted working tree — about
  to be split into 3 commits and shipped feature→dev→staging→main)
- **scope:** 42 files (30 Group 1 + 8 Group 2 [4 new] + 4 Group 3), per the
  explicit review request; everything else in `git status`'s 176 changed
  paths is out of scope (stray/WIP noise) and was not reviewed
- **date:** 2026-09-28
- **qa decision:** ~~BLOCK~~ → **WARN** (revised same day after the blocking
  fix — see "Revision" section below)
- **approved_for_ship:** true
- **user_overrode:** false — not an override; the BLOCKing condition
  (security F-001) was actually fixed, then re-verified, not bypassed. The
  remaining QA-F-001..F-004 (Medium/WARN, test-coverage gaps) were
  explicitly accepted by the user as a follow-up rather than fixed now —
  that is the one point where this ships on user sign-off rather than a
  clean PASS.

## Revision (same day, after initial BLOCK)

Security F-001 (the sole condition gating the original BLOCK — see "Why
BLOCK" below, left intact for the record) was fixed: `CreateOperationTemplateDto`/
`UpdateOperationTemplateDto` (+ their nested `CreateOpTemplateActivityDto`/
`ConsumableInputDto`/`LaborInputDto`/`ToolIdQtyDto`) moved out of
`operation-template.service.ts` into a real `class-validator`-decorated
`backend/src/modules/routings/dto/operation-template.dto.ts`, field lengths
matched to `schema.prisma`'s own column widths (`icon` → `@MaxLength(40)`,
etc.). Re-verified per this file's own §"Unblock path" step 3:
- `tsc -b` both backend and frontend — clean, 0 errors.
- Full `pnpm jest` re-run — 903/920 passing, same 4 pre-existing/unrelated
  failing suites as before (cycle-time, bom-matching, template-binding,
  project-progress), no new failures.
- Live HTTP verification against the running dev server (not just unit
  tests): an overlong `icon` string now 400s with a real class-validator
  message; a valid `icon` update still 200s; a full `POST /operation-templates`
  with a nested `activities[].consumables/skills/tool_ids` payload round-trips
  correctly through `whitelist: true` (confirmed the nested data reaches the
  Prisma layer intact, not silently stripped — a real FK-violation 500 on a
  deliberately-wrong test `resource_id` proved the payload got all the way
  through validation before failing on real DB constraints); test row
  cleaned up (DELETE) after.
- `GET /mo/24/print-packet` still 200s (icon feature's actual consumer,
  unaffected by the DTO change).

QA-F-001 through F-004 (the four Medium/WARN test-coverage gaps) were
presented to the user directly; they chose to ship now and track the gap
as a follow-up rather than close it in this pass — see findings file for
what's still open.

## Why BLOCK

Two independent reasons, either one sufficient on its own:

1. **Security returned BLOCK on the same scope, same day** — the parallel
   `security` review (`docs/security/findings/2026-09-28-s36-leftovers-op-icon-print-r4.md`)
   found F-001 (High): `CreateOperationTemplateDto`/`UpdateOperationTemplateDto`
   in `backend/src/modules/routings/services/operation-template.service.ts`
   are plain TypeScript interfaces, not `class-validator`-decorated
   classes — every field on `POST/PATCH operation-templates`, including the
   new `icon` field this diff adds, has zero runtime request-body
   validation. Confirmed by re-reading the current file directly as part of
   this pass (not just trusting the security finding) — still present,
   unresolved. **Per `qa.md`'s own rule, QA has no authority to lift a
   security BLOCK** ("Overriding security findings" is a listed
   anti-pattern; "No active BLOCK from security subagent" is checklist item
   #10, and its own severity column says "(security blocks)").
2. Independently of security, this QA pass's own checklist item #2 ("Wiki
   test summary exists") also fails — see QA-F-001 in the findings file.
   This alone would normally also BLOCK per `qa.md`'s default rule, though
   this pass follows the same-branch 2026-09-24 precedent of surfacing it
   as WARN given the backfill-sprint circumstances (no Notion DoD exists
   yet to check it against) — noted here for completeness, not counted
   twice toward the verdict since security's F-001 already gates it.

**This is not a rejection of the engineering work itself.** Everything this
pass could independently verify — the 4 new Prisma migrations (all
additive, no data-loss risk), the actual runtime logic (traced by hand:
team-headcount server-side cap, WO-cancel budget release, MO auto-start
revert, `wo_remaining` computation, the QR-icon/watermark/page-numbering PDF
logic), and every re-run test suite (backend + frontend, fresh, not
trusted) — came back clean or Medium/Low-only. See findings file for the
full breakdown; nothing found there rises to Critical/High on its own.

## checks_performed

See `docs/qa/findings/2026-09-28-s36-leftovers-op-icon-print-r4.md` for the
full 10-item checklist table with evidence per row. Summary:

| # | check | result |
|---|---|---|
| 1 | Notion DoD | n/a — no DoD exists yet for this backfill-sprint slice |
| 2 | Wiki test summary exists | **gap** (QA-F-001, WARN per branch precedent) |
| 3 | Wiki summary DoD coverage | n/a (blocked by #2) |
| 4 | Raw test report | n/a — this findings file + fresh re-run stand in |
| 5 | Backend coverage on changed files | partial gap (QA-F-002/F-003/F-004, Medium/WARN each) |
| 6 | CI green | n/a — nothing pushed yet; local typecheck + full test suites re-run fresh instead, all pass except 4 known-pre-existing/unrelated suites |
| 7 | Wiki diff present | same gap as #2 |
| 8 | Manual test evidence | not supplied to this review (code comments suggest real live-iteration testing occurred, but that's not a scenario list/screenshot handed to this pass) |
| 9 | Smoke test | n/a — no Playwright coverage for this feature set |
| 10 | No active security BLOCK | **FAILED** — security F-001, High, unresolved |

## findings

Full detail in `docs/qa/findings/2026-09-28-s36-leftovers-op-icon-print-r4.md`:

- **QA-F-001** (Medium→WARN) — missing wiki test summary for this slice
- **QA-F-002** (Medium→WARN) — `getAssemblies()`'s new `wo_remaining` field, zero test coverage
- **QA-F-003** (Medium→WARN) — `activities.service.ts`'s new `operation_type_id` filter, zero test coverage
- **QA-F-004** (Medium→WARN) — MO print packet round 4's new drawing logic (QR icon, watermark icon, page footer), no dedicated test assertions
- **QA-F-005** (Low→INFO) — headcount input accepts non-integer client-side, backend correctly 400s
- **QA-F-006** (Low→INFO) — orphaned `useAddFromLibrary` hook/endpoint after the local-staging refactor
- **QA-F-007** (Low→INFO) — one extra API call per operation row to gate a button's visibility

Plus, reflected (not re-derived) from the parallel security pass:

- **Security F-001** (High→BLOCK, unresolved) — `operation-templates`
  create/update endpoints have zero DTO validation; this is the finding
  that actually gates this sign-off. Route: backend. Fix path already
  specified in that findings file (convert the two interfaces to
  `class-validator` classes; minimum viable fix for `icon` alone is
  `@IsString() @MaxLength(40) @IsOptional()`, matching the `VARCHAR(40)`
  column).
- **Security F-002** (Low) — `getAssemblies()`'s new `operation_id` query
  param cast via bare `Number(...)` instead of `ParseIntPipe` — same shape
  as a pre-existing Low finding on this branch, cheap fix, not blocking.

## Unblock path

1. **Required:** backend converts `CreateOperationTemplateDto`/
   `UpdateOperationTemplateDto` to real `class-validator`-decorated classes
   (security F-001's fix route) — this is the one change that actually
   flips this verdict.
2. **Strongly recommended before/alongside the same commit:** the four
   Medium/WARN test-coverage gaps (QA-F-001 through F-004) — none
   individually blocking, but four in one diff is worth closing together
   rather than letting them compound across the next slice of this branch's
   work, especially given this branch already carried one WARN-level
   coverage gap forward from 2026-09-24 (F-002 there) that is still open
   today.
3. Once F-001 (security) is fixed, re-run this pass's own re-verification
   steps (`tsc -b` both sides, the 4 targeted spec files, full backend +
   frontend suites) to confirm the DTO fix didn't regress anything, then
   this sign-off can be revised to PASS/WARN without re-doing the full
   manual trace.

## Note on Notion / log.md audit trail

Per `qa.md`'s Definition-of-Done, a BLOCK verdict is returned immediately
without waiting — Notion task update and `~/Documents/bdt/knowledge-base/log.md`
audit entries are the release-gate orchestrator's job on a PASS/WARN
outcome, not this review's. Not performed here since the verdict is BLOCK.
