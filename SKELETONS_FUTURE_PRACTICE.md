# Skeletons — Future Practice Compliance

> **Author:** Cowork architect pass — 2026-04-29
> **Status:** 🟡 Skeleton-only — **NOT** to be implemented in Sprint 4
> **Companion docs:**
> - [`GAP_ANALYSIS_ROUTING_STDTIME.md`](./GAP_ANALYSIS_ROUTING_STDTIME.md) — gap analysis (which gaps these fill)
> - [`SPRINT_PLAN_ROUTING_STD_TIME.md`](./SPRINT_PLAN_ROUTING_STD_TIME.md) — Sprint 4 plan (current sprint scope)

---

## 1. Why skeletons exist

The xlsx data BDT has today (`Production-Std-Time-Cost-Machines.xlsx` + `process routing.xlsx`) covers ~60% of what proper Odoo MRP / Siemens Opcenter / ISA-95 / steel-shop practice requires. The other 40% — execution, productivity, change governance, quality, maintenance, capacity planning, telemetry — has no source data and is deferred to later sprints.

Rather than wait until each sprint's planning to invent the schema and module shape, **all 11 deferred entities are pre-shaped now** as:

1. **Prisma models** in [`backend/prisma/schema.skeleton.prisma`](./backend/prisma/schema.skeleton.prisma) — copy-paste ready
2. **NestJS module folders** in [`backend/src/modules/_skeletons/`](./backend/src/modules/_skeletons) — 9 modules with stub controller + service + per-module SKELETON.md
3. **This master index** — claim sequence, FK dependencies, activation procedure

Benefit: when Sprint 5 starts, the dev/Claude Code can copy 1 model into `schema.prisma`, run migration, replace the stubs in `_skeletons/<name>/` with logic, and ship. **Schema design effort = zero**.

## 2. Skeleton inventory

| # | Module folder | Sprint | Tag | Practice ref | Replaces / fills |
|---|---|:-:|:-:|---|---|
| 1 | [`mrp-orders/`](./backend/src/modules/_skeletons/mrp-orders/) | **5** | 🟦 | Odoo `mrp.production`, `mrp.workorder`, `stock.production.lot` | `MO` + `SN` xlsx sheets |
| 2 | [`mrp-productivity/`](./backend/src/modules/_skeletons/mrp-productivity/) | **5** | 🟦 | Odoo `mrp.workcenter.productivity` · ISA-95 Equipment Performance | actual OEE A% measurement |
| 3 | [`mrp-eco/`](./backend/src/modules/_skeletons/mrp-eco/) | **5** | 🟦 | Odoo `mrp.eco` | governance for BOM/Routing/Drawing changes after release |
| 4 | [`routing-dependency/`](./backend/src/modules/_skeletons/routing-dependency/) | **5** | 🟨 | ISA-95 ProcessSegmentDependency · Siemens Process Segment graph | typed op dependency graph (sequential / parallel / exclusive / alternate) |
| 5 | [`personnel-skills/`](./backend/src/modules/_skeletons/personnel-skills/) | **6** | 🟨 | ISA-95 PersonnelSpec · AWS D1.1 / TIS 2543 | welder cert + skill matrix + activity skill requirement |
| 6 | [`quality/`](./backend/src/modules/_skeletons/quality/) | **6** | 🟦 | Odoo `quality.point` + `quality.check` · AISC 360-16 N5 · AWS D1.1 §6 | structured pass/fail per inspection point |
| 7 | [`maintenance/`](./backend/src/modules/_skeletons/maintenance/) | **6** | 🟦 | Odoo `maintenance.equipment` + `maintenance.request` · TPM | equipment register (220 items in `machine_equipment` xlsx sheet) + corrective/preventive |
| 8 | [`capacity-planning/`](./backend/src/modules/_skeletons/capacity-planning/) | **7** | 🟨 | Siemens Opcenter APS · APICS S&OP | forward-looking capacity buckets (week / month) per WC |
| 9 | [`mes-events/`](./backend/src/modules/_skeletons/mes-events/) | **7** | 🟥 | ISA-95 Operations Performance · Siemens Opcenter Execution event model | append-only shop-floor event stream |

**Total:** 11 Prisma models · 9 NestJS modules · 9 SKELETON.md briefs. All cross-referenced.

## 3. Dependency graph

```
Sprint 4 (current) ─┬─► routing master + cycle time
                    │
Sprint 5 ──────────►├─► mrp-orders          ◄── needs Sprint 4 routing
                    ├─► mrp-eco             ◄── governs BOM/routing/drawing edits
                    ├─► mrp-productivity    ◄── needs mrp-orders (workorder FK)
                    └─► routing-dependency  ◄── extends Sprint 4 routing
                    
Sprint 6 ──────────►├─► personnel-skills    ◄── needs Sprint 4 activity templates
                    ├─► quality             ◄── needs Sprint 5 workorder + serial
                    └─► maintenance         ◄── needs Sprint 4 workcenter
                    
Sprint 7 ──────────►├─► mes-events          ◄── needs Sprint 5 mrp-orders
                    └─► capacity-planning   ◄── needs Sprint 5 mrp-orders + mes-events
```

The order is **not arbitrary** — it's the topological dependency. Skipping a level breaks foreign keys.

## 4. Activation procedure (per skeleton)

When the claiming sprint starts:

1. **Check FK readiness** — confirm all `⏳` entries in the SKELETON.md "FK dependencies" section are now ✅
2. **Move Prisma model** — copy the relevant section from `schema.skeleton.prisma` into `schema.prisma`; **drop the `_skeleton` suffix** on model name
3. **Run migration** — `pnpm --filter backend prisma migrate dev --name sprint<N>_<entity>`
4. **Move module folder** — `git mv backend/src/modules/_skeletons/<name> backend/src/modules/<name>`
5. **Wire into AppModule** — add to `imports: [...]` in `backend/src/app.module.ts`
6. **Replace stubs** — implement controller + service per the SKELETON.md checklist
7. **Add DTOs + state machine + tests** — same pattern as Sprint 1 `materials/`, Sprint 3 `boms/`
8. **Update CHANGELOG.md** — under the new sprint heading
9. **Remove `_skeleton` mention** — the SKELETON.md itself can be deleted or moved to `docs/adr/` as historical context

## 5. Why this preserves value

| Concern | Without skeleton | With skeleton |
|---|---|---|
| Sprint 5 planning effort | Re-derive Odoo MRP entity shapes from scratch | Read SKELETON.md, copy schema, focus on logic |
| Schema drift | Different sprint authors choose different field names | Cowork's architect pass enforces Odoo convention upfront |
| FK readiness checks | Discovered mid-implementation | Pre-listed in SKELETON.md |
| Practice compliance audit | Subjective per-sprint | Verifiable: "is each skeleton claimed?" |
| New-team onboarding | Must read all sprint plans | Read this index → pick a skeleton → read its SKELETON.md |

## 6. What's *intentionally* NOT skeletoned

To avoid scope inflation, the following are excluded from this skeleton pass:

- **Accounting** (Odoo `account.move`, `account.move.line`) — separate functional domain
- **Inventory** (Odoo `stock.move`, `stock.warehouse`) — Sprint 8+ once we add stock tracking
- **Sales / Purchase orders** (Odoo `sale.order`, `purchase.order`) — separate functional domain
- **Project costing rollup beyond `cost_production`** — Sprint 6 `costing/` module within main schema
- **Real-time PLC integration** — out of MES Sprint 7 scope; Sprint 9+ if BDT signs hardware contracts
- **Gantt scheduling UI** — Sprint 7 frontend work
- **Reporting / BI** — separate sprint, separate stack (Metabase or custom)

These are **noted in the gap analysis** but not pre-shaped here because their boundaries are unclear without business-side discussion.

## 7. Validation when skeletons land

After the next sprint kickoff, run:

```bash
# Verify no skeleton model leaks into main schema unless claimed
grep -E '_skeleton\b' backend/prisma/schema.prisma && echo "FAIL: rename!" || echo "OK"

# Verify all _skeletons/* folders that have NOT been claimed still build
pnpm --filter backend build && echo "OK"
```

The `_skeletons/*.module.ts` files use `throw new Error('SKELETON: not implemented')` — they compile, but throw if accidentally registered in AppModule. Safe to leave in repo.

## 8. ADR pointer

This pass instantiates **ADR-RT-7** from `GAP_ANALYSIS_ROUTING_STDTIME.md` ("Routing operations created in Sprint 4 use read-only seed from xlsx; custom routing creation deferred to Sprint 5") at the architectural level — Sprint 4 = depth-first on routing only; everything else is breadth-first as skeletons.

## 9. Update log (2026-04-29)

Following the ECO + versioning + bulk-edit gap analysis ([`GAP_ANALYSIS_ECO_VERSIONING_BULK.md`](./GAP_ANALYSIS_ECO_VERSIONING_BULK.md)):

- **`mrp-eco` skeleton** updated with richer scope (`scope_type`, `scope_target_ids`, `scope_criteria`, `override_policy`, `reset_overrides_json`, version-bump fields, `before_after_diff`); effort estimate raised from 12 h → 24 h. See [`mrp-eco/SKELETON.md`](./backend/src/modules/_skeletons/mrp-eco/SKELETON.md) for full Sprint 5 checklist.
- **Sprint 4.2** added **Epic G** (RT48-RT49) — 3 history tables (`routing_template_history`, `routing_activity_template_history`, `product_routing_override_history`) per Layer-1 versioning model; budget 100 → 106 h.
- **Sprint 4.3** opened ([`SPRINT_PLAN_ROUTING_4_3.md`](./SPRINT_PLAN_ROUTING_4_3.md)) — 24 h partial sprint for bulk override (RT50-51), history UI (RT52-53), custom-routing promotion (RT54), docs (RT55). Should ship before Sprint 5 to wire ECO bulk path correctly.

---

*— Skeletons in place. Hand off to Claude Code.*
