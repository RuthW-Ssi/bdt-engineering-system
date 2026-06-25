# APS Spine Reload Runbook — WC/line/op_type/operation/activity (จาก DRAFT → DB)

วันที่: 2026-06-24 · source: `APS_WC_LINE_LAYOUT.xlsx` (17 WC/29 line), `APS_OP_ACTIVITY_DRAFT.xlsx` (13 op_type/20 op/123 act)

## สถานะ DB ปัจจุบัน (recon)
- spine: op_type 12 · WC 19 (13 active/6 inactive) · line 8 · activity 53 · operation_template 23 · op_tmpl_activity 65 · activity_skill 61 · op_act_skills 71
- **routing/mo/wo = 0** (teardown แล้ว) → WC ไม่มี RESTRICT block ✅
- FK ที่ block การลบ/แก้ WC+line = **operator_workcenter(121)** + wip_storage(6)/wip_storage_io(20) [NO ACTION], work_center_calendar(18)[CASCADE]
- activity/operation ลบได้ปลอดภัย → cascade activity_skill/op_act_skills/op_act_material/op_act_tool/activity_consume/tool (= ของเดิม derive ใหม่ได้)

## A. WC reconcile (17 ใหม่) — **reuse id เดิม (rename code) เพื่อคง wip/operator FK**, ของไม่มีในใหม่ = deactivate (ไม่ลบ)
| new wc_code | new name | map → old (reuse id) | หมายเหตุ |
|---|---|---|---|
| WC-CUT-PIPE | CNC Plasma Pipe Cutting | WC-CUT-PIPE | คงเดิม |
| WC-CUT-PLATE2.5M | CNC Plasma Plate 2.5m | WC-CUT-PLATE-CNC2.5M | rename |
| WC-CUT-PLATE6.0M | CNC Plasma Plate 6.0m | WC-CUT-PLATE-CNC6.0M | rename |
| WC-CUT-SAW | Band Saw Cutting | WC-CUT-SAW | คงเดิม |
| WC-DRILL | CNC Plate Drilling | WC-DRILL | คงเดิม |
| WC-FIT-WELD | Fit-up & Welding | WC-FIT-WELD | คงเดิม |
| WC-GRIND | Grinding/Finishing | WC-GRIND | คงเดิม |
| WC-HBEAM | H-beam Built-up (18m) | WC-HBEAM | คงเดิม |
| WC-PUNCH | Hydraulic Punching | WC-PUNCH | คงเดิม |
| WC-PRESS-110 | Machine Press 110T + Die | WC-PRESS | rename (เดิมมี 2 line 110/200) |
| WC-STRAIGHTEN | H-beam Flange Straightening | WC-STN | rename |
| WC-THREAD | Rod Threading / Tapping | WC-TAP | rename |
| WC-PAINT | Painting (airless) | WC-PT (reactivate) | rename + active=true |
| WC-PRESS-BRAKE | Hydraulic Press Brake 200T | **NEW** | แยกจาก WC-PRESS line200 |
| WC-FAB-BEAM | Beam Fab (subcontractor) | **NEW** | เดิมเป็น fab-bay line |
| WC-FAB-PIPE | Pipe-truss Fab (subcontractor) | **NEW** | เดิมเป็น fab-bay line |
| WC-SURFACE | Surface Prep / Shot Blast | **NEW** | — |

- **reuse 13 id, insert 4 ใหม่ = 17 active.** deactivate: **WC-BU** (built-up เดิม→แทนด้วย WC-HBEAM). คง inactive เดิม: WC-AS, WC-PR, WC-TEST-X, WC-WELD-MAG, WC-WELD-SMAW.
- wc_type machine/manual → เก็บใน note (resource_type คง 'workcenter'); crew_layout → `nominal_crew`; manual WC (FIT-WELD/FAB/GRIND/PAINT) `capacity_mode='nominal_crew'`, machine = 'manual'(per-line).

## B. lines (29) — เคลียร์ operator_workcenter.line ก่อน แล้ว reload
- delete operator_workcenter (NO ACTION block) → delete 8 lines เดิม → insert 29 ใหม่ (FK = WC id หลัง reconcile).

## C. op_type (13) — upsert by key
- เดิม 12 keys: assembly,beam,blast,cut,drill,finish,fitup,form,grind,inspect,paint,weld
- ใหม่ 13: cut,drill,punch,bend,thread,build,straighten,fit,weld,grind,blast,paint,inspect
- upsert by key (insert ใหม่: punch,bend,thread,build,straighten,fit; คง: cut,drill,weld,grind,blast,paint,inspect; เดิมเกิน assembly,beam,fitup,finish,form = คงไว้เฉยๆ ไม่ลบ ไม่กระทบ). +sequence ตาม stage.

## D. activity (123) + operation (20) + op_tmpl_activity (123) — replace ทั้งหมด
**ลำดับ (FK-safe):**
1. `delete from operation_template` → cascade op_tmpl_activity + op_act_skills/material/tool
2. `delete from activity` → cascade activity_skill/tool/consume/required_consumable
3. insert op_type (upsert), WC (reconcile), lines
4. insert activity (123): `activity_code, name=name_th, kind, duration_min = per_minute (NaN→0)`
5. insert operation_template (20): `op_code, name, op_type_id(by key), workcenter_id(by code), time_mode='formula'`
6. insert op_tmpl_activity (123): `operation_template_id(by op_code), sequence=seq, name=name_th, per_minute, measure = ratio (NaN→ unit→ 'unit'), unit, source_activity_id(by activity_code)`

**field mapping (draft → table):**
| draft | activity | op_tmpl_activity |
|---|---|---|
| activity_code | activity_code | (→ source_activity_id via lookup) |
| name_th | name | name |
| kind | kind | (kind อยู่ที่ activity) |
| per_minute | duration_min | per_minute |
| ratio | — | measure (NaN→unit→'unit') |
| unit | — | unit |
| std_measure/manpower | — (เก็บใน activity_skill ภายหลัง) | — |

## E. re-derive + verify
- re-derive `operator_workcenter` (operator_skill→activity_skill→operation_template.WC) — **NOTE:** activity_skill ว่าง (ลบไป) → operator_workcenter จะ derive ไม่ได้จนกว่าจะเติม activity_skill (manpower+skill) ใหม่. ⚠️ = loose-end (draft มี manpower แต่ยังไม่มี skill mapping)
- activities_snapshot: mrp_routing_workcenter=0 → ยังไม่ต้อง regen (รอ routing ใหม่)
- verify: counts (op_type≥13, WC 17 active, line 29, activity 123, operation 20, op_act 123), FK 0 orphan, wip/operator ไม่พัง

## ⚠️ ประเด็นต้องตัดสิน / flag
1. **WC reconcile**: reuse id+rename (คง FK) — ตามตาราง A ✅ หรือลบทิ้งหมดสร้างใหม่?
2. **activity_skill (manpower+skill)**: draft มี manpower (จำนวน) แต่ **ไม่มี skill mapping** → operator_workcenter derive ไม่ได้ → ต้องทำ activity_skill รอบใหม่ (มี skill 18 ตัวเดิม). ทำในรอบนี้เลย หรือแยก?
3. **per_minute ผิดปกติ**: ACT-CUT-PIPE-30 = 16.667 min/m (สูงผิดเทียบ plate 0.658) · ACT-GRIND-20 = NaN→0. load as-is (tunable) flag ไว้
4. **measure**: ใส่ ratio (driver) เป็นหลัก, NaN→unit→'unit' — ตกลงไหม
5. activity ratio/unit ปนหลายภาษา (meter/square meter/kg/point/ชิ้น/รู) — normalize ภายหลัง

*runbook — ยังไม่แตะ DB*
