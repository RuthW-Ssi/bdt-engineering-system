# 🟡 SKELETON — `quality` (Sprint 6)

**Tag:** 🟦 Standard Odoo
**Practice basis:** Odoo `quality.point` + `quality.check` + `quality.alert` · AISC 360-16 Chapter N · AWS D1.1 §6 acceptance criteria

## Why this exists as a skeleton

Sprint 4 routing operations include "ตรวจสอบความถูกต้อง" / "Inspect for accuracy" activities, but there's no structured pass/fail capture. Without quality module:

- Cannot enforce blocking checks (e.g., NDT failure must stop next op)
- Cannot generate inspection reports for client handover
- Cannot drive corrective-action workflow
- Cannot satisfy AISC 360-16 N5 documentation requirement

Schema in `prisma/schema.skeleton.prisma` Section 6.

## Sprint 6 implementation checklist

- [ ] Migrations: `quality_point` + `quality_check`
- [ ] Seed standard inspection points (per AISC Ch.N + AWS D1.1):
  - Visual weld inspection (after every welding op)
  - Dimensional check (after fit-up)
  - NDT MT (after critical full-penetration welds, e.g., column-base)
  - Paint thickness (after each paint coat — Elcometer 456)
  - Bolt torque (after assembly bolting)
- [ ] Inspector role/RBAC: create `qa_inspector` group; only this group can transition `state=fail`
- [ ] Blocking logic: `is_blocking=true` + `state=fail` → blocks WO `action_done`
- [ ] FE: per-WO quality tab — list of points + inspector form + photo attach
- [ ] FE: project-level QA dashboard — pass rate, blocking failures, top 5 fail reasons

## Standard inspection points to seed (~20)

| code | test_type | spec | block? |
|---|---|---|:-:|
| `WELD-VIS` | visual | AWS D1.1 §6.9 | ✅ |
| `WELD-MT` | ndt_mt | AWS D1.1 §6.10 | ✅ |
| `WELD-UT` | ndt_ut | AWS D1.1 §6.13 | ✅ |
| `DIM-FITUP` | dimensional | AISC 360-16 N5.4, ±3 mm | ✅ |
| `PAINT-DFT` | paint_thickness | μm per spec, e.g., primer 75 ±15 | |
| `BOLT-TORQUE` | torque | AISC RCSC | |

## FK dependencies

- ✅ `products` (Sprint 2)
- ⏳ `mrp_routing_workcenter` (Sprint 4)
- ⏳ `mrp_workorder` + `stock_production_lot` (Sprint 5)
- ✅ `res_users` (Sprint 1)
