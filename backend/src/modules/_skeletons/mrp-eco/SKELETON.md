# 🟡 SKELETON — `mrp-eco` (Sprint 5)

**Tag:** 🟦 Standard Odoo
**Practice basis:** Odoo 17 `mrp.eco` + ECO workflow extension
**Replaces xlsx:** N/A — change governance not in current xlsx

## Why this exists as a skeleton

Sprint 3 BOM has `eco_id INT?` column. Sprint 4 routing has implicit edit-on-active. Without ECO module:

- Engineers can mutate active BOM/routing/drawing without trace
- No CHECK constraint to require ECO when modifying released artefacts
- No cost-impact tracking
- No cross-project propagation rules

Schema in `prisma/schema.skeleton.prisma` Section 3.

## Sprint 5 implementation checklist

- [ ] Migration: `mrp_eco` model
- [ ] Add CHECK constraints on `product_bom`, `mrp_routing_workcenter`, `shop_drawing`:
  - When `state='active'` AND any line modified → must have valid `eco_id`
- [ ] State machine: `draft → review → approved → in_progress → done | rejected`
- [ ] Approval workflow (multi-step, configurable per ECO type)
- [ ] Cost impact calculation: if BOM/routing changed, recompute affected products' `cost_production`
- [ ] Notification: notify `responsible_uid` on stage change (reuse `mail_message`)
- [ ] FE: ECO list page + ECO detail wizard (subject picker → reason → impact preview → approve)
- [ ] FE: badge on product/BOM/drawing pages showing "ECO-2026-XXX in progress"

## ECO types

- `bom` — BOM line change after activation
- `routing` — Routing op or activity change after activation
- `drawing` — Released drawing supersession (links revision A → B)
- `product` — Material/UoM/category change on confirmed product
- `hybrid` — Multi-subject (e.g., new revision drawing requires new BOM)

## FK dependencies

- ✅ `products` (Sprint 2)
- ✅ `product_bom` (Sprint 3)
- ⏳ `mrp_routing_workcenter` (Sprint 4)
- ✅ `shop_drawing` (Sprint 3)
- ✅ `res_users` (Sprint 1)
