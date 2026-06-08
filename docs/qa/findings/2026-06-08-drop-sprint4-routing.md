# QA Findings · drop-sprint4-routing

_Date: 2026-06-08 · Feature: T-ACT.02 · Branch: dev-t-drop-sprint4-routing_
_QA subagent dispatched by /release-gate · review-only_

---

## Implementation quality (pre-gate structural checks)

> These are NOT release criteria by themselves — they confirm the code is sound
> before the process gates are evaluated.

| Check | Result |
|---|---|
| Frontend `tsc --noEmit` | PASS — 0 errors |
| Backend `tsc --noEmit` | PASS — 0 errors |
| `prisma validate` | PASS — schema valid |
| Model count (`grep -c "^model " schema.prisma`) | 45 (matches task target) |
| Migration file at `backend/prisma/migrations/20260607200000_drop_sprint4_routing/migration.sql` | EXISTS |
| Migration SQL drops 10 tables in child-first order | CORRECT |
| Deleted BE services absent (activity-templates, bulk-override, custom-routing, override, routing-promotion) | CONFIRMED |
| Deleted FE pages absent (ActivityTemplateMaster, BulkOverrideAdmin, CustomRoutingEditor, RoutingEditor) | CONFIRMED |
| `App.tsx` routes for deleted pages removed | CLEAN |
| `BomRoutingConfig.tsx` refactored — `createCustomRouting` replaced with `createRouting` | CONFIRMED |
| Stub services (cycle-time, std-cost, zone-summary) return empty/null with Sprint 11b comment | PROPERLY STUBBED |
| `routings.module.ts` providers/exports cleaned | CLEAN |
| Sprint 4 type identifiers in `.ts` source files | CLEAN (only `.md` skeleton docs — no runtime impact) |

---

## F-01 · Wiki DoD coverage map: 0/25 items marked — all "⏳ pending"

- **where:** `wiki/tech/testing/per-feature/drop-sprint4-routing.md` — DoD coverage map table (lines 19–50)
- **what:** Tester wiki summary exists but every single DoD criterion is still "⏳ pending". No test has been executed and no result has been recorded. The wiki was created as a pre-implementation planning spec; tester has not updated it post-implementation.
- **severity:** High
- **evidence:** Every row in the DoD coverage map shows status `⏳ pending`. Zero rows show `✅ pass` or any evidence of execution. Per tester role, filling this table after implementation is a mandatory DoD item for the tester role.
- **fix_route:** tester — execute structural checks + regression smoke + update DoD coverage map with actual results

---

## F-02 · No manual test evidence from user

- **where:** Chat history, Notion task T-ACT.02 completion notes — neither contains manual test evidence
- **what:** QA role card §"Anti-patterns" #1: "Signing off without manual test evidence — 'Trust me' not acceptable — require screenshot or scenario list from user." The manual smoke checklist in the tester wiki (8 FE steps + 11 BE curl checks) has not been performed by the user.
- **severity:** High
- **evidence:** No screenshots, no scenario completion notes, no Notion completion notes visible. Tester wiki explicitly marks `/api/v1/activities`, `/bom`, `/routings`, `/routings/:id/edit`, `/admin/operation-library` as "pending user" in smoke test section.
- **fix_route:** user — run FE manual smoke (sidebar nav + 4 key pages) + confirm `/bom/:id/routing` shows disabled state for createCustomRouting; provide screenshot or scenario confirmation in chat or Notion

---

## F-03 · No CI runs found for branch

- **where:** `gh run list --limit 5 --branch dev-t-drop-sprint4-routing` → no output
- **what:** Branch has not been pushed to remote. No CI workflow has run against this branch. CI green is a mandatory gate before ship (CLAUDE.md §5.2 checklist item 6).
- **severity:** High
- **evidence:** `gh run list` returned empty. Branch is likely local-only. Until CI runs (GitHub Actions `deploy-backend.yml` and `migrate-deploy.yml`) and passes, build integrity is unconfirmed on the CI runner environment.
- **fix_route:** devops — push branch to remote (`git push -u origin dev-t-drop-sprint4-routing`), confirm CI green before `/release-gate` re-run

---

## F-04 · No raw test report file

- **where:** `docs/test-scripts/drop-sprint4-routing/` — directory does not exist
- **what:** Per CLAUDE.md §6: "every testable feature gets a test report in `docs/test-scripts/<feature>/`". Tester wiki references this at `docs/test-scripts/drop-sprint4-routing/drop-sprint4-routing-test-report-YYYY-MM-DD.md` but no such file exists.
- **severity:** Medium (mitigated: pure structural migration — no new business logic; wiki explicitly notes N/A for coverage)
- **evidence:** `find docs/test-scripts/drop-sprint4-routing` → path does not exist. Tester wiki `## Test report` section shows placeholder `YYYY-MM-DD`.
- **fix_route:** tester — create `docs/test-scripts/drop-sprint4-routing/drop-sprint4-routing-test-report-2026-06-08.md` with structural verification results and smoke curl outputs

---

## F-05 · Wiki drift — data-model.md + features/routings.md retain Sprint 4 routing chain sections

- **where:**
  - `wiki/tech/data-model.md` lines 30–31, 39–41, 102, 142–165, 174 — mermaid diagram + model descriptions for `routing_activity_template`, `routing_op_activity`, `product_routing_override`, `custom_routing`, `custom_routing_op`, `custom_routing_activity`, `has_custom_routing`, history tables
  - `wiki/features/routings.md` lines 26–33, 60–61, 81, 93–103 — class hierarchy diagram, compute path logic, simulator section referencing dropped models
- **what:** Both wiki pages describe the Sprint 4 routing chain as current. After T-ACT.02 drops 10 tables, these sections are now contradictions that will mislead future developers.
- **severity:** Medium (wiki drift — heuristic #3: "Wiki drift = future contradiction")
- **evidence:** `grep routing_activity_template wiki/tech/data-model.md` → 6 hits. `grep custom_routing wiki/features/routings.md` → 5 hits. None are marked as superseded.
- **fix_route:** wiki-integrator — remove Sprint 4 routing chain sections from data-model.md mermaid diagram and model descriptions; update features/routings.md to mark Sprint 4 compute path as superseded, add banner linking to Activity Library (T-ACT.01)

---

## F-06 · Wiki test summary model count and drop count are stale

- **where:** `wiki/tech/testing/per-feature/drop-sprint4-routing.md` line 23: "Total model count = 43 (51 − 8)"
- **what:** Pre-spec was written before T-ACT.01 added 3 models (activity, activity_consume, activity_code_seq) and before the final scope expanded to 10 dropped models (not 8 — `routing_op_act_tool` and `routing_op_act_consumable` were not in the original 8-table list). Correct values: 45 models after (from 55 pre-drop), 10 tables dropped.
- **severity:** Low (the tester wiki is a planning doc; numeric mismatch creates confusion but does not block execution)
- **evidence:** `grep -c "^model " schema.prisma` → 45. Migration drops: `routing_activity_template`, `routing_op_activity`, `routing_op_act_tool`, `routing_op_act_consumable`, `product_routing_override`, `custom_routing`, `custom_routing_op`, `custom_routing_activity`, `routing_activity_template_history`, `product_routing_override_history` = 10 tables. Wiki says 8.
- **fix_route:** wiki-integrator — update line 23 of drop-sprint4-routing.md: "Total model count = 45 (55 − 10)" and update §Expected values model counts accordingly

---

## F-07 · SKELETON.md planning files reference dropped model names

- **where:**
  - `backend/src/modules/_skeletons/mrp-eco/SKELETON.md` lines 10, 24, 27, 30, 44, 59–62, 84
  - `backend/src/modules/_skeletons/personnel-skills/SKELETON.md` lines 8, 40
  - `backend/src/modules/_skeletons/maintenance/SKELETON.md` line 9
- **what:** Planning/skeleton markdown files mention `routing_activity_template`, `product_routing_override`, `custom_routing` as future integration targets. These are now dropped tables. The skeleton plans will need to be revised when those modules are implemented.
- **severity:** Low (markdown planning docs — not compiled TypeScript, no runtime impact)
- **evidence:** `grep -rn "routing_activity_template\|product_routing_override\|custom_routing" backend/src/modules/_skeletons/` → 10 hits, all in `.md` files only.
- **fix_route:** wiki-integrator — note in skeleton files that the Sprint 4 chain was dropped; update integration targets to Activity Library models when those skeletons are activated

---

_High findings: F-01, F-02, F-03 — all require resolution before ship._
_Medium findings: F-04, F-05 — may proceed with explicit user acknowledgement._
_Low findings: F-06, F-07 — do not block._
