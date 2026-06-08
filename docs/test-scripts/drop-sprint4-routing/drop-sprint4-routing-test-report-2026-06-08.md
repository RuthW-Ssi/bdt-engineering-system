# T-ACT.02 Drop Sprint 4 Routing Chain — Test Report
**Date:** 2026-06-08  
**Branch:** dev-t-drop-sprint4-routing  
**Tester:** Claude Code (inline smoke — user approved "run smoke now + ship")

---

## Structural Checks (all PASS)

| Check | Expected | Result | Status |
|---|---|---|---|
| Frontend `tsc --noEmit` | 0 errors | 0 errors | ✅ PASS |
| Backend `tsc --noEmit` | 0 errors | 0 errors | ✅ PASS |
| Prisma schema validates | No model errors | Valid (env-only warning expected locally) | ✅ PASS |
| Model count | 45 | 45 | ✅ PASS |
| Migration SQL exists | Yes | `20260607200000_drop_sprint4_routing/migration.sql` | ✅ PASS |
| Migration uses `IF EXISTS` on all DROPs | Yes | All 10 DROP TABLE + 2 ALTER TABLE have `IF EXISTS` | ✅ PASS |
| Migration uses child-first order | Yes | routing_op_act_tool → routing_op_act_consumable → routing_op_activity → … → routing_activity_template | ✅ PASS |
| Migration wrapped in transaction | Yes | `BEGIN` / `COMMIT` | ✅ PASS |

## Deleted Files Check (all PASS)

| File | Status |
|---|---|
| `services/activity-templates.service.ts` | ✅ Deleted |
| `services/bulk-override.service.ts` | ✅ Deleted |
| `services/custom-routing.service.ts` | ✅ Deleted |
| `services/override.service.ts` | ✅ Deleted |
| `services/routing-promotion.service.ts` | ✅ Deleted |
| `src/pages/ActivityTemplateMaster.tsx` | ✅ Deleted |
| `src/pages/BulkOverrideAdmin.tsx` | ✅ Deleted |
| `src/pages/CustomRoutingEditor.tsx` | ✅ Deleted |
| `src/pages/RoutingEditor.tsx` | ✅ Deleted |

## Source Cleanliness (all PASS)

| Check | Result |
|---|---|
| No Sprint 4 routes in App.tsx | ✅ CLEAN |
| No `createCustomRouting` import in frontend | ✅ CLEAN |
| No `routing_op_activity` / `routing_activity_template` in backend/src | ✅ CLEAN |
| No `has_custom_routing` / `product_routing_override` in backend/src | ✅ CLEAN |
| Sprint 11b stub comments in cycle-time, std-cost, zone-summary | ✅ PRESENT |

## Accepted Degradations (Sprint 11b)

- cycle-time.service: `compute()` returns `{ operations: [], total_cycle_time_min: 0 }`
- std-cost.service: `compute()` returns `{ cost_per_op: [], total_production_cost: 0 }`
- zone-summary.service: `compute()` returns `{ applied_count: 0, consumables: [], by_assembly: [] }`
- BomRoutingConfig: op_activities section disabled; template-apply calls `createRouting` (direct bind, not custom clone)

## Decision

**PASS (structural smoke)** — user-approved inline execution per release-gate BLOCK override decision.  
CI will run after push in devops step.
