# Sprint 4.3 Implementation Plan — Stub

> **Status:** 📋 STUB — full plan to be authored at Sprint 4.2 closeout
> **Author:** Cowork architect pass — 2026-04-29
> **Sprint:** 4.3 (follow-up to Sprint 4.2 — partial sprint, ~24 h)
> **Companion docs:**
> - [`SPRINT_PLAN_ROUTING_STD_TIME_4_2.md`](./SPRINT_PLAN_ROUTING_STD_TIME_4_2.md) — Sprint 4.2 (template + simulator + history)
> - [`GAP_ANALYSIS_ECO_VERSIONING_BULK.md`](./GAP_ANALYSIS_ECO_VERSIONING_BULK.md) — gap analysis driving 4.3 scope
> - [`backend/src/modules/_skeletons/mrp-eco/SKELETON.md`](./backend/src/modules/_skeletons/mrp-eco/SKELETON.md) — Sprint 5 ECO

---

## 1. Why Sprint 4.3 exists

Sprint 4.2 closes Option 3 routing pattern + Template Simulator + Layer-1 history (per Option E decision 2026-04-29). The ECO+versioning+bulk-edit gap analysis surfaced 3 features that are **valuable but separable** from the core 4.2 deliverables:

1. **Bulk override** (flavour 3b) — engineer applies one override to N products matching criteria
2. **History UI** — per-template / per-activity / per-override change timeline view (data captured in 4.2 RT48-49; UI presents it)
3. **Custom Routing → Sub-Template promotion** (flavour 3c lite) — when 3+ products share an unusual recipe, promote to a shared sub-template

These are **independent of Sprint 5 mrp-eco activation** — they can ship before ECO module lands, with `eco_id` field stubs that Sprint 5 wires later.

## 2. Sprint 4.3 scope (estimated 24 h / 1.5 days × 2 devs)

### 2.1 Stories

| ID | Tag | Story | Effort |
|---|:-:|---|---|
| **RT50** | 🟨 | API `POST /api/v1/routing-overrides/bulk` — body `{criteria, override, eco_id?, preview_only?}` matches products by FK + `attribute_filter`; transactional upsert; skips `has_custom_routing=true` with warning | 4 h |
| **RT51** | 🟨 | FE admin page `/admin/bulk-overrides` — filter form (project/zone/category/mark/attr) → Find Products → Preview count → Apply with reason + ECO ID input | 4 h |
| **RT52** | 🟦 | FE: History UI on RoutingEditor + ActivityTemplateMaster + WorkcenterMaster — "Show History" button → drawer with timeline + diff per change (uses 4.2 RT49 endpoint) | 5 h |
| **RT53** | 🟨 | FE: Per-product override history panel — on RoutingEditor right side, expandable below SimulatorPanel, shows override audit trail with "rollback" button (creates new override matching historical value, with reason "rollback to vN") | 3 h |
| **RT54** | 🟥 | API + FE: `POST /custom-routings/:id/promote-to-template` — if N≥3 custom routings share structure, suggest creating a new shared `routing_template`; copies ops + activities; rebinds source products + similar products opt-in | 6 h |
| **RT55** | 🟦 | E2E + docs + ADR-0009 (bulk edit) + ADR-0010 (custom-routing promotion); CHANGELOG.md Sprint 4.3 section | 2 h |

**Total:** 24 h

### 2.2 Out-of-scope (explicit)

| Deferred to | Item |
|---|---|
| Sprint 5 | ECO module activation — until then, Sprint 4.3 endpoints accept `eco_id?` as optional reference field; no FK enforcement |
| Sprint 5 | ECO Impact Preview UI (data hooks present in 4.3 history endpoints; UI builds on top in Sprint 5) |
| Sprint 5 | In-flight WO re-snapshot trigger (depends on mrp-orders skeleton) |
| Sprint 6+ | Cross-template Compare (simulator) — same template only in 4.2 |
| Sprint 6+ | Override conflict resolution (when two ECOs touch same product simultaneously) |

## 3. Schema additions (none new — reuses 4.2 + skeleton)

Sprint 4.3 uses tables already shipped or skeletoned:
- `product_routing_override` (Sprint 4.2) — bulk-upserted via RT50
- `routing_template` + `routing_template_history` (Sprint 4.2) — read by RT52 history UI
- `routing_activity_template` + `*_history` (Sprint 4.2) — read by RT52
- `product_routing_override_history` (Sprint 4.2) — read by RT53
- `custom_routing` + ops + activities (Sprint 4.2) — input to RT54 promotion service

## 4. Hand-off

Sprint 4.3 follows Sprint 4.2 directly. Recommend:
- 1.5-day partial sprint OR fold into a 7-day Sprint 4-Combined (4.1 + 4.2 + 4.3 = 130 h, 8.5 days)
- Pre-Sprint 5 — important to ship 4.3 BEFORE Sprint 5 kicks off because Sprint 5 ECO module needs scope_type='override_bulk' wired to RT50 endpoint

## 5. Open items at sprint-plan-authoring time

Re-confirm at Sprint 4.2 closeout:
- Has Sprint 4.2 demo surfaced any UX issues that should reshape RT51 (bulk override admin page)?
- Has scale testing on `product_routing_override_history` shown the trigger overhead is acceptable for bulk edits >1000 products?
- Is `attribute_filter` query performance acceptable on `products.attributes JSONB` with no GIN index? (Sprint 4.3 may add GIN index if RT50 perf <200 ms required)

---

*— stub — full plan to be authored at Sprint 4.2 closeout*
