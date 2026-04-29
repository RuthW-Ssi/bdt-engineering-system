# 🟡 SKELETON — `maintenance` (Sprint 6)

**Tag:** 🟦 Standard Odoo
**Practice basis:** Odoo `maintenance.equipment` + `maintenance.request` · TPM (Total Productive Maintenance)
**Replaces xlsx:** `process routing.xlsx → machine_equipment` (220 rows)

## Why this exists as a skeleton

Sprint 4 `routing_activity_template.equipment_ref` is a free-text string. Sprint 6 turns it into an FK and unlocks:

- Equipment register (the 220 items in xlsx)
- Maintenance requests (corrective + preventive + predictive)
- Equipment availability impact on scheduling
- Cost-of-ownership reports per machine

Schema in `prisma/schema.skeleton.prisma` Section 7.

## Sprint 6 implementation checklist

- [ ] Migrations: `maintenance_equipment` + `maintenance_request`
- [ ] xlsx importer: parse `machine_equipment` sheet → 220 records
- [ ] Convert Sprint 4 `equipment_ref` (string) → `equipment_id` (FK) — backfill where serial_no matches
- [ ] State machine: equipment `operational → broken → under_maint → operational | retired`
- [ ] Auto-block: equipment `state=broken` → its WC's WOs get `state=blocked` until fixed
- [ ] Preventive scheduling: cron creates `maintenance_request` based on hours-run from MES events
- [ ] FE: equipment grid (status colour-coded) + request kanban board

## Categories observed in xlsx (220 rows)

- Hand Tools (most common)
- Fixed Workshop Furniture (CNC, SAW, Press)
- Personal Computer + Monitor
- Laser/Inkjet Printer
- Refrigerator, Fan, UPS (facility)

## FK dependencies

- ⏳ `mrp_workcenter` (Sprint 4)
- ✅ `res_users` (Sprint 1)
- ⏳ `mes_shop_floor_event` (Sprint 7) — for hours-run preventive trigger
