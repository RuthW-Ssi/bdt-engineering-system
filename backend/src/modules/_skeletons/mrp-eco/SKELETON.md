# 🟡 SKELETON — `mrp-eco` (Sprint 5) — RICHER scope per ECO/versioning analysis

**Tag:** 🟦 Standard Odoo (extended)
**Practice basis:** Odoo 17 `mrp.eco` + AISC WPS practice + ISA-95 Production Rule lifecycle
**Replaces xlsx:** N/A — change governance not in current xlsx
**Reference:** [`../../../../GAP_ANALYSIS_ECO_VERSIONING_BULK.md`](../../../../GAP_ANALYSIS_ECO_VERSIONING_BULK.md)

## Why this exists as a skeleton

Sprint 3 BOM has `eco_id INT?` column. Sprint 4.2 has `product_routing_override.eco_id`. Sprint 4 routing has implicit edit-on-active. Without ECO module:

- Engineers can mutate active BOM/routing/drawing/override without trace
- No CHECK constraint to require ECO when modifying released artefacts
- No cost-impact tracking
- No cross-project propagation rules
- No override-survival policy enforcement (overrides survive vs reset on template change)
- No bulk-override governance for multi-product changes

Schema in `prisma/schema.skeleton.prisma` Section 3 (richer scope after 2026-04-29 update).

## Sprint 5 implementation checklist

- [ ] Migration: `mrp_eco` model with richer scope (already in skeleton schema)
- [ ] Add CHECK constraints on `product_bom`, `mrp_routing_workcenter`, `shop_drawing`, `product_routing_override`:
  - When parent `state='active'` AND any field modified → must have valid `eco_id`
- [ ] State machine: `draft → review → approved → in_progress → done | rejected`
- [ ] **scope_type discrimination** — service routes to correct apply path: `template` / `activity_template` / `override_single` / `override_bulk` / `custom_routing` / `product` / `bom` / `drawing` / `hybrid`
- [ ] **Override survival policy enforcement** (D11) — apply path consults `eco.override_policy`:
  - `survive` (default) → no-op on overrides
  - `reset` → DELETE `product_routing_override` WHERE `activity_template_id IN scope_target_ids`
  - `reset_matching` → DELETE WHERE override value matches `before_after_diff.before` value
  - Capture wiped rows into `eco.reset_overrides_json` for audit + manual restore
- [ ] **Layer-2 version bumping** on apply (D12) — when `eco.bumps_version=true`:
  - Bump `routing_template.version` (or activity_template.version)
  - Capture before_version + after_version on ECO
  - Layer-1 history triggers (Sprint 4.2 RT49) write snapshot automatically
- [ ] **In-flight WO re-snapshot** (D15) — find `mrp_workorder` where:
  - `state ∈ {pending, ready}` AND product affected by ECO
  - Re-run `CycleTimeService.compute()` and overwrite `activity_snapshot Json`
  - Frozen states `{progress, done}` skipped (preserved for traceability)
- [ ] **ECO Impact Preview UI** (gap analysis §5.2) — before approval, show:
  - Bound products count
  - With/without override count
  - On custom_routing count (untouched)
  - Cycle time impact avg + total
  - In-flight MO re-snapshot count + frozen count
- [ ] Approval workflow (multi-step, configurable per ECO type)
- [ ] Cost impact calculation: if BOM/routing changed, recompute affected products' `cost_production`
- [ ] Notification: notify `responsible_uid` on stage change (reuse `mail_message`)
- [ ] FE: ECO list page + ECO detail wizard (scope picker → policy choice → impact preview → approve)
- [ ] FE: badge on product/BOM/drawing/template pages showing "ECO-2026-XXX in progress"
- [ ] Wire override-creation gate from D2 (Sprint 4.2): "after MO confirmed → eco_id required" (server-side check using mrp_production state)

**Effort update:** original skeleton estimated ~12 h. With richer scope + override policy + version bump + re-snapshot + impact preview UI, **~24 h** for Sprint 5. Plan accordingly.

## ECO scope_type values

- `template` — affects `routing_template` (all bound products inherit unless overridden)
- `activity_template` — affects single `routing_activity_template` (all uses)
- `override_single` — single `product_routing_override` change (1 product)
- `override_bulk` — multiple overrides via `scope_criteria` (Sprint 4.3 endpoint creates these ECOs)
- `custom_routing` — affects single product's `custom_routing`
- `product` — Material/UoM/category change on confirmed product
- `bom` — BOM line change after activation
- `drawing` — Released drawing supersession (links revision A → B)
- `hybrid` — Multi-subject (e.g., new revision drawing requires new BOM)

## Override survival policy (D11)

When `scope_type` is `template` or `activity_template`, ECO modifies a recipe element. Existing per-product overrides on the same element follow the policy:

| Policy | Behaviour | Use case |
|---|---|---|
| `survive` (default) | All overrides untouched | Most common — process improvement, overrides exist for valid steel-domain reasons |
| `reset` | All overrides on the changed activity wiped | When original template was wrong; engineer wants fresh slate |
| `reset_matching` | Only overrides whose value equals the OLD template value are wiped | "Products that were in sync stay in sync" — preserves intentional deviations |

Wiped rows captured in `eco.reset_overrides_json` for audit + restore.

## FK dependencies

- ✅ `products` (Sprint 2)
- ✅ `product_bom` (Sprint 3)
- ⏳ `routing_template`, `mrp_routing_workcenter`, `routing_activity_template`, `product_routing_override`, `custom_routing` (Sprint 4.2)
- ⏳ `mrp_production`, `mrp_workorder` (Sprint 5 sibling — for in-flight re-snapshot)
- ✅ `shop_drawing` (Sprint 3)
- ✅ `res_users` (Sprint 1)
