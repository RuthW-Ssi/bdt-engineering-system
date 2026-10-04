# APS — Build Sequence (รื้อใหม่หมด) — ลำดับ entry ตาม dependency

**Legend:** ✍️ กรอกมือ (คุณป้อน) · ⚙️ generate/derive (script ทำให้) · 🔗 จากระบบเดิม (Odoo/transactional)

> กฎทอง: ป้อนจาก **ไม่มี dependency → มี dependency มากสุด**. ทุก step ที่ ✍️ ให้ใส่ **business key (code)** เสมอ เพื่อให้ ⚙️ join/derive ได้.

---

## PHASE A — Masters (รากฐาน ป้อนก่อน)

| #   | ตาราง                    | entry อะไร (key fields)                                                                                                            | ขึ้นกับ     | type    |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------- |
| A1  | `mrp_op_type`               | ชนิด operation:`key`, `label`, `color` — เช่น Cut/Form/Drill/Beam/Fit-up/Weld/Grind/Blast/Paint/Inspect/Assembly        | —                 | ✍️    |
| A2  | `mrp_workcenter`            | WC:`code`, `name`, `sequence`, `capacity`, `capacity_mode`(manual/nominal_crew), `nominal_crew`, `active`, `parent_id` | A1 (default_wc_id) | ✍️    |
| A2b | `mrp_op_type.default_wc_id` | UPDATE ผูก op_type → WC หลัก (วงกลม: ทำหลัง A2)                                                                     | A1,A2              | ✍️    |
| A3  | `mrp_workcenter_line`       | line ต่อ WC ที่มีเครื่องขนาน:`workcenter_id`, `line_no`, `name`                                               | A2                 | ✍️    |
| A4  | `br`                        | tool/crane/fixture/secondary:`code`, `type`, `rate`                                                                              | —                 | ✍️    |
| A5  | `materials`                 | วัสดุ master:`default_code`, `name`, `uom_id`                                                                               | —                 | 🔗/✍️ |
| A6  | `skill`                     | ทักษะ atomic EN:`name`                                                                                                          | —                 | ✍️    |
| A7  | `operator`                  | พนักงาน:`code`, `name`, `position_raw`, `nationality`, `active`                                                       | —                 | ✍️    |
| A8  | `operator_skill`            | คน↔ทักษะ:`operator_id`, `skill_id`, `level`(A/B/B+)                                                                      | A6,A7              | ✍️    |

---

## PHASE B — Activity library (คลังกิจกรรม)

| #  | ตาราง                                              | entry อะไร                                                                                                                   | ขึ้นกับ | type |
| -- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| B1 | `activity`                                            | กิจกรรม master:`activity_code`, `name`, `duration_min`, `machine_id`, **`kind`** (setup/run/move/inspect) | A4 (machine)   | ✍️ |
| B2 | `activity_skill`                                      | คนที่ activity ต้องใช้:`activity_id`, `skill`, **`qty`**, `level`                                      | B1,A6          | ✍️ |
| B3 | `activity_tool`                                       | เครื่องมือต่อ activity:`activity_id`, `resource_id`, qty                                                        | B1,A4          | ✍️ |
| B4 | `activity_consume` / `activity_required_consumable` | วัสดุสิ้นเปลืองต่อ activity:`activity_id`, `resource_id`, qty/formula                                      | B1,A5          | ✍️ |

> **setup ไม่ต้องเป็น column แยก** — สร้างเป็น activity ที่ `kind='setup'` (1 ตัวต่อ machine/process) แล้วผูกใน operation (C2) seq ต้น ๆ

---

## PHASE C — Operations (templates)

| #  | ตาราง                            | entry อะไร                                                                                                                                                                             | ขึ้นกับ | type |
| -- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---- |
| C1 | `operation_template`                | operation ต่อ (op_type+WC):`op_code`, `name`, `op_type_id`, `workcenter_id`, `method`, `time_mode`, `duration_min`                                                        | A1,A2          | ✍️ |
| C2 | `operation_template_activity`       | activity ใน operation (ลำดับ):`operation_template_id`, `sequence`, `source_activity_id`, `per_minute`, `measure`/`unit` — **ใส่ setup-activity ที่ seq 5** | C1,B1          | ✍️ |
| C3 | `op_act_skills`                     | คนต่อ op-activity:`op_act_id`, `skill`, `qty`, `level`                                                                                                                        | C2,A6          | ✍️ |
| C4 | `op_act_material` / `op_act_tool` | วัสดุ/เครื่องมือต่อ op-activity (+**qty**)                                                                                                                         | C2,A4,A5       | ✍️ |

---

## PHASE D — Routing (เส้นทางผลิต)

| #  | ตาราง                                     | entry อะไร                                                                                                                       | ขึ้นกับ | type |
| -- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---- |
| D1 | `routing_template`                           | หัว routing:`code`, `name`                                                                                                    | —             | ✍️ |
| D2 | `mrp_routing_workcenter`                     | operation ใน routing:`template_id`, `sequence`, `op_type_id`, `workcenter_id`, `time_cycle`, `blocked_by_op_ids`       | D1,A1,A2       | ✍️ |
| D3 | `mrp_routing_workcenter.activities_snapshot` | **GENERATE** จาก operation_template_activity (C2) → JSON ฝัง activity (name/per_minute/source_activity_id/skills/tools) | C2,D2          | ⚙️ |

> ⚠️ snapshot (D3) คือ denormalized — ต้อง regenerate **ทุกครั้งที่แก้ B/C**. `work_order_time_rollup` อ่านจากนี้

---

## PHASE E — Calendar

| #  | ตาราง               | entry อะไร                                                                                                         | ขึ้นกับ | type |
| -- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| E1 | `calendar`             | `code`, `name` (เช่น FACTORY-STD)                                                                              | —             | ✍️ |
| E2 | `calendar_block`       | กะ:`dow`(1–6), `start_time`, `end_time`, `kind`(normal/ot) — 08:00–12:00 + 13:00–17:30 + ot 18:00–22:00 | E1             | ✍️ |
| E3 | `calendar_exception`   | วันหยุด:`date`, `type`(holiday), `is_working=false`, `note` (15 วันปี 2569)                        | E1             | ✍️ |
| E4 | `work_center_calendar` | ผูก WC↔calendar:`work_center_id`, `calendar_id`                                                                | A2,E1          | ✍️ |

---

## PHASE F — WIP storage

| #  | ตาราง         | entry อะไร                                                                                                                                                          | ขึ้นกับ | type |
| -- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| F1 | `wip_storage`    | คลัง WIP:`code`, `name`, `bay`, `col_from/to`, `width_m`, `depth_m`, `area_cap_m2`, `weight_cap_kg`(=area×300), `manager_wc_id`, `buffer_mode` | A2             | ✍️ |
| F2 | `wip_storage_io` | WC ไหน in/out คลังไหน:`storage_id`, `wc_id`, `direction`(in/out)                                                                                        | F1,A2          | ✍️ |

---

## PHASE G — Transactional (จากระบบ หรือป้อน)

| #  | ตาราง                                                                                                       | entry อะไร                                                                                                                                                    | ขึ้นกับ | type |
| -- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| G1 | `manufacturing_order`                                                                                          | MO:`mo_code`, `routing_template_id`, `due_date`, `status`                                                                                                 | D1             | 🔗   |
| G2 | `bom_assembly`/`bom_dispatch`/`project_zone`/`bom_assembly_part` · `product_bom`/`product_bom_line` | โครงสร้างชิ้นงาน + BOM                                                                                                                            | A5,D2          | 🔗   |
| G3 | `work_order`                                                                                                   | WO:`wo_code`, `mo_id`, `sequence`, `work_center_id`, `expected_duration_min`, `target_end_at`, `earliest_start_at`, `status`, `bom_assembly_id` | G1,A2          | 🔗   |
| G4 | `work_order.source_routing_op_id`                                                                              | **GENERATE** = match `mo.routing_template_id` + `wo.sequence` → `mrp_routing_workcenter.id`                                                          | D2,G3          | ⚙️ |

---

## PHASE H — Scheduling layer (ส่วนใหญ่ derive ไม่กรอกมือ)

| #  | object                                                                | entry/derive อะไร                                                                                                                                                                    | ขึ้นกับ | type |
| -- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| H1 | `operator_workcenter`                                               | **DERIVE**: operator_skill→activity_skill→activity→operation_template.WC (active) + `is_primary` + `workcenter_line_id` mock                                                | A8,B2,C2,A3    | ⚙️ |
| H2 | VIEW `work_center_eligibility`                                      | op_type→WC จาก operation_template                                                                                                                                                    | C1             | ⚙️ |
| H3 | VIEW `operation_activity_rollup` / `work_order_time_rollup`       | setup/run/move/inspect min ต่อ template / ต่อ WO (จาก snapshot)                                                                                                                 | B1,C2,D3,G4    | ⚙️ |
| H4 | VIEW `work_center_skill_capacity`                                   | WC×skill→จำนวน operator                                                                                                                                                           | H1             | ⚙️ |
| H5 | `scheduler_config`                                                  | knobs: objective weights, horizon, granularity, direction, dispatch_rule, allow_ot, reschedule_mode, solver_time_limit,`operator_constraint_mode` (off/soft/hard) + global default row | —             | ✍️ |
| H6 | `subcontractor` + `work_order.operator_mode`/`subcontractor_id` | ผู้รับเหมา master + flag ต่อ WO (internal/subcontract)                                                                                                                      | G3             | ✍️ |
| H7 | VIEW `wip_event` / `wip_balance`                                  | occupancy buffered + balance vs cap                                                                                                                                                      | F1,F2,G3       | ⚙️ |
| H8 | `prod_schedule_version` + `prod_schedule`                         | output ของ solver (start/end ต่อ WO/line)                                                                                                                                          | G3             | ⚙️ |

---

## สรุปลำดับ (critical path)

`op_type → WC → (line, equipment, skill, operator) → activity(+kind) → activity_skill → operation_template → operation_template_activity → routing → SNAPSHOT → [calendar, wip] → MO/BOM/WO → source_routing(gen) → operator_workcenter(derive) → views → scheduler_config → solver`

## หลักที่ต้องคุมตลอด

1. **คง business key (code)** ทุกตาราง → derive/regenerate ได้เสมอ
2. **activities_snapshot ต้อง regenerate** หลังแก้ activity/operation ทุกครั้ง (ไม่งั้น rollup ผิดเงียบ)
3. **setup = activity kind='setup'** ไม่ใช่ column
4. ทำบน **Supabase branch** ก่อน merge
5. H1–H4, H7 เป็น **derive** — ห้ามกรอกมือ (ป้อนผิดจะขัด source)

---

*แผนลำดับ entry — ยังไม่ลงมือกับ DB*
