# 🟡 SKELETON — `mrp-orders` (Sprint 5)

**Tag:** 🟦 Standard Odoo
**Practice basis:** Odoo 17 `mrp.production` + `mrp.workorder` + `stock.production.lot` · ISA-95 Operations Performance
**Replaces xlsx:** `process routing.xlsx → MO` (998 rows) + `SN` (1000 rows)

## Why this exists as a skeleton

Sprint 4 ships routing master + cycle time engine but does NOT execute production. To go live with MRP, three Odoo-core entities are required:

1. **`mrp_production`** — Manufacturing Order (one per product × zone × planned qty)
2. **`mrp_workorder`** — Work Order (one per MO × routing operation; tracks actual time)
3. **`stock_production_lot`** — Serial Number (one per individual finished assembly)

These are **standard Odoo MRP** — not BDT-custom. Schema in `prisma/schema.skeleton.prisma` Section 1.

## Sprint 5 implementation checklist

- [ ] Move 3 models from skeleton to `schema.prisma`, run migration
- [ ] State machines: MO `draft → confirmed → planned → progress → to_close → done | cancel`; WO `pending → ready → progress → done | cancel`
- [ ] MO planning: when MO confirmed, generate WOs from product's active routing (one WO per `mrp_routing_workcenter`)
- [ ] Auto-populate per-WC duration columns from routing recompute (cut_parts_buildup_min, etc.)
- [ ] Tekla import adapter populates MO + WO + SN in batch (matches MO sheet rows)
- [ ] Wire `mrp_eco` (also Sprint 5 skeleton) — MO refs current ECO if any
- [ ] FE: MO list page + MO detail with Gantt-style WO strip + per-WO start/finish capture

## API endpoints (target)

```
GET    /api/v1/manufacturing-orders
POST   /api/v1/manufacturing-orders
GET    /api/v1/manufacturing-orders/:id
PATCH  /api/v1/manufacturing-orders/:id
POST   /api/v1/manufacturing-orders/:id/action_confirm
POST   /api/v1/manufacturing-orders/:id/action_plan
POST   /api/v1/manufacturing-orders/:id/action_done
POST   /api/v1/manufacturing-orders/:id/action_cancel

GET    /api/v1/work-orders?mo_id=&workcenter_id=&state=
PATCH  /api/v1/work-orders/:id
POST   /api/v1/work-orders/:id/action_start
POST   /api/v1/work-orders/:id/action_pause
POST   /api/v1/work-orders/:id/action_done
POST   /api/v1/work-orders/:id/report_qty       # body: { qty_produced, qty_scrapped }

GET    /api/v1/serials?product_id=&zone_id=
POST   /api/v1/serials                          # bulk-create from MO planning
GET    /api/v1/serials/:id
PATCH  /api/v1/serials/:id                      # update state, paint_layer, etc.
```

## FK dependencies

- ✅ `products` (Sprint 2)
- ✅ `product_bom` (Sprint 3)
- ⏳ `mrp_routing_workcenter` (Sprint 4)
- ✅ `project`, `project_zone`, `mark_prefix_master` (Sprint 2)
- ✅ `uom_uom`, `res_users` (Sprint 1)
- ⏳ `mrp_eco` (Sprint 5 skeleton — this folder's sibling)

## Open design questions for Sprint 5 kickoff

1. Should MO scheduling be naive (drag onto Gantt) or pull from `mrp_workcenter_capacity_plan` (Sprint 7)?
2. Lot vs Serial: Sprint 5 ships Serial only (1 SN = 1 finished mark); Lot tracking deferred.
3. WO-to-WO dependency — read from `routing_op_dependency` skeleton or compute on the fly from sequence?
