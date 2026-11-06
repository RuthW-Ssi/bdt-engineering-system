# APS Scheduling — Input Data Readiness Map

> โจทย์: **ก่อนรัน algorithm ใดๆ ต้องมี input data ครบ** — เอกสารนี้ลิสต์ข้อมูลทั้งหมดที่ finite-capacity scheduler ต้องใช้ แล้ว map กับของจริงใน Supabase (`bdt-engineer-system`) ว่ามี schema ไหม / มี data ไหม / ต้องเติมอะไร
> ตรวจกับ DB จริง 2026-06-17 · จะไม่ทำขั้นอื่นจน data ครบ

**Legend**
- **Req (จำเป็นแค่ไหน):** 🔴 ต้องมีก่อนรัน v1 · 🟠 เพิ่มความแม่น (fidelity) · ⚪ ไว้ทีหลัง
- **Schema:** ✅ มี · ⚠️ มีบางส่วน · ❌ ไม่มี
- **Data:** ✅ มีข้อมูลใช้ได้ · ⚠️ มี field แต่ยังไม่ populate · — ว่าง · 🔗 อยู่ระบบอื่น (Odoo)

---

## สรุปก่อน (headline)

✅ **Input ขั้นต่ำสำหรับรัน scheduler v1 — มีและ populate แล้ว** (work center, work order + duration 8/8, due 8/8, earliest-start 8/8, sequence/precedence, status/actual) → **รันได้เลยถ้าต้องการ**
🟡 **ที่ต้องเติม data** (field มีแล้วแต่ยังว่าง): setup time, op-type link, precedence array, WC capacity>1
❌ **ตารางที่ยังไม่มี** (ค่อยทำเมื่อต้องการ feature นั้น): work calendar/shift, alternate-WC, skills, setup matrix, scheduler config
🔗 **อยู่ Odoo**: material inventory/stock/lead-time

---

## 1. Resources — กำลังการผลิตที่จัดงานลง

| Input ที่ต้องใช้ | ทำไมต้องมี | Supabase | Req | Schema | Data |
|---|---|---|:--:|:--:|:--:|
| Work centers (เครื่อง/ไลน์) | แถวที่จัดงานลง | `mrp_workcenter` (18) | 🔴 | ✅ | ✅ |
| Finite capacity ต่อ WC | จำกัดงานขนานต่อเครื่อง | `mrp_workcenter.capacity` | 🔴 | ✅ | ⚠️ ทุกตัว=1 (ยืนยันว่ามีขนานไหม) |
| Working calendar (ชั่วโมง/กะ) | เวลาทำงานจริง | `working_hours_per_week`, `time_start/stop` | 🔴 | ⚠️ หยาบ | ✅ |
| **Shift / holiday / downtime calendar** | non-working ที่แม่น + เครื่องเสีย | — (`maintenance_log` 56, `machine_status_history` 7, `equipment_resource.current_status` มี แต่ยังไม่ผูกเป็น blackout) | 🟠 | ❌ ตารางปฏิทินไม่มี | ⚠️ ข้อมูล downtime ดิบมี |
| **Alternate / eligible WC ต่อ op** (FJSP) | op ลงเครื่องสำรองได้ | — (ไม่มี `mrp_workcenter_line`/eligibility) | 🟠 | ❌ | — |
| Efficiency / OEE derate | คิดเวลาจริง vs ideal | `time_efficiency, oee_target, availability/performance/quality` | 🟠 | ✅ | ✅ |

## 2. Secondary resources — ทรัพยากรร่วม (คอนสเตรนต์เสริม)

| Input | ทำไม | Supabase | Req | Schema | Data |
|---|---|---|:--:|:--:|:--:|
| Tools / equipment | เครื่องมือจำกัด | `equipment_resource` (48, มี type/rate/status) | 🟠 | ✅ | ✅ |
| Tool requirement ต่อ op | op ต้องใช้ tool ไหน | `op_act_tool` (67), `activity_tool` (53) | 🟠 | ✅ | ✅ |
| Operator/labor requirement ต่อ op | ต้องใช้กี่คน | `op_act_labor` (41), `activity_labor` (34) มี `qty` | 🟠 | ✅ | ✅ |
| **Labor pool / availability** | จำนวนคนที่มีจริง/กะ | `labor_resource_id` ถูกอ้าง แต่ **ไม่มีตาราง labor master ชัด**; `mrp_workcenter.labor_mix` | 🟠 | ⚠️ | ⚠️ |
| **Skills matrix** (ใครทำอะไรได้) | จำกัดงานตามทักษะ | — ไม่มีตาราง skill | ⚪ | ❌ | — |
| Crane | ผูกเครน/zone | `project_zone.crane_assignment` (string) | ⚪ | ⚠️ | ⚠️ |

## 3. Jobs / demand — งานที่จะจัด

| Input | ทำไม | Supabase | Req | Schema | Data |
|---|---|---|:--:|:--:|:--:|
| Manufacturing orders | ใบสั่งผลิต | `manufacturing_order` (7) | 🔴 | ✅ | ✅ |
| Work orders (= operation ที่ต้องวาง) | bars ที่จัด | `work_order` (8) | 🔴 | ✅ | ✅ |
| Quantity ต่องาน | ขนาดงาน | `mo_assembly_line.qty` (12), `bom_assembly.qty` | 🔴 | ✅ | ✅ |
| **Processing time ต่อ op** | ความยาวบาร์ | `work_order.expected_duration_min` | 🔴 | ✅ | ✅ **8/8** |
| **Due date ต่องาน** | สำหรับ backward/tardiness | `work_order.target_end_at` (✅8/8) + `mo.due_date` + `project_zone.target_erection_*` | 🔴 | ✅ | ✅ |
| **Priority / erection sequence** | ลำดับความสำคัญ | `project_zone.erection_sequence` | 🔴 | ✅ | ✅ |
| **Release / earliest-start (material-ready)** | เริ่มได้เร็วสุดเมื่อไหร่ | `work_order.earliest_start_at` (✅8/8), `released_at` | 🔴 | ✅ | ✅ |
| **Status + actual start/end** | สำหรับ frozen/in-progress | `work_order.status, actual_start_at/end_at` | 🔴 | ✅ | ✅ (actual 4/8) |
| Setup time ต่อ op | เวลาตั้งเครื่อง | `work_order.setup_time_min` | 🟠 | ✅ | ⚠️ **0/8 (ยังไม่ใส่)** |
| Op type/category | สี/จัดกลุ่ม/changeover | `source_routing_op_id`→`mrp_op_type` (label/color) | 🟠 | ✅ | ⚠️ **link 0/8 (null)** |

## 4. Process / precedence — เงื่อนไขลำดับงาน

| Input | ทำไม | Supabase | Req | Schema | Data |
|---|---|---|:--:|:--:|:--:|
| Intra-job precedence (op→op) | cut ก่อน weld | `work_order.sequence` (linear) | 🔴 | ✅ | ✅ |
| Explicit precedence DAG | ลำดับซับซ้อน/branch | `mrp_routing_workcenter.blocked_by_op_ids` | 🟠 | ✅ field | ⚠️ **0/45 (ว่าง)** |
| Cross-WO dependency | งานข้าม MO/รอกัน | — ไม่มี `work_order_dependency` | 🟠 | ❌ | — |
| Inter-job (assembly↔part) | ประกอบรอชิ้นส่วน | `bom_assembly_part` (841) มี แต่ยังไม่ผูกเป็น sched-dep | 🟠 | ⚠️ | ✅ ข้อมูลมี |
| Routing template + ops | นิยามขั้นตอน | `routing_template` (6), `mrp_routing_workcenter` (45) | 🔴 | ✅ | ✅ |

## 5. Materials — คอนสเตรนต์การเริ่ม

| Input | ทำไม | Supabase | Req | Schema | Data |
|---|---|---|:--:|:--:|:--:|
| Material requirement ต่อ op | งานต้องใช้วัสดุอะไร | `op_act_material` (33), `bom_assembly_part`, `bom_part` | 🟠 | ✅ | ✅ |
| Material master | ข้อมูลวัสดุ | `materials` (37) | 🟠 | ✅ | ✅ |
| **Inventory / on-hand / lead-time** | วัสดุพร้อมเมื่อไหร่ | — ไม่มี field stock/lead ใน `materials` | 🟠 | ❌ | 🔗 Odoo (ตอนนี้ใช้ `earliest_start_at` แทน) |
| Lot / shelf-life | คุมอายุ | N/A เหล็ก | ⚪ | — | — |

## 6. Constraints config / parameters

| Input | ทำไม | Supabase | Req | Schema | Data |
|---|---|---|:--:|:--:|:--:|
| Finite/infinite mode | คิดข้อจำกัดไหม | `mrp_workcenter.capacity` | 🔴 | ✅ | ✅ |
| Horizon / time bucket | ขอบเขตการจัด | — config (app-level) | 🟠 | ❌ | — |
| **Objective weights** (tardiness/makespan/setup) | เป้าการ optimize | — config | 🟠 | ❌ | — |
| MIN_RESCHEDULE tolerance / cadence | กัน nervous schedule | — config | ⚪ | ❌ | — |
| Frozen horizon | โซน frozen | `prod_schedule_version.frozen_until` | 🟠 | ✅ *(เพิ่มแล้ว)* | ✅ |
| Freeze modes (multi) | time/started/pinned | `prod_schedule_version.freeze_modes` | 🟠 | ✅ *(เพิ่มแล้ว)* | ✅ |
| Pin / lock | ปักหมุดงาน | `work_order.is_pinned` | 🟠 | ✅ *(เพิ่มแล้ว)* | ✅ |
| Bottleneck designation (DBR) | จัดจากคอขวด | — ไม่มี `routing_template.bottleneck_op_id` | ⚪ | ❌ | — |

## 7. Schedule output — ที่เก็บผล

| Input | Supabase | Req | Schema | Data |
|---|---|:--:|:--:|:--:|
| Scheduled operations | `prod_schedule` | 🔴 | ✅ | ✅ |
| Schedule versions / what-if | `prod_schedule_version` | 🔴 | ✅ | ✅ |

---

## To-fill checklist (จัดลำดับก่อน-หลัง)

**กลุ่ม A — เติม data ในตารางที่มีอยู่แล้ว (ทำได้เลย ไม่ต้องแก้ schema)**
- [ ] **Setup time** → ใส่ `work_order.setup_time_min` (ตอนนี้ 0 ทั้ง 8) — จากมาตรฐานต่อ op/เครื่อง
- [ ] **Op-type link** → ใส่ `work_order.source_routing_op_id` (ตอนนี้ null) → ปลดสี op-type + changeover grouping
- [ ] **WC capacity** → ยืนยัน `mrp_workcenter.capacity` เครื่องไหนขนานได้ (ตอนนี้ =1 หมด)
- [ ] **Precedence (ถ้าต้อง DAG)** → ใส่ `mrp_routing_workcenter.blocked_by_op_ids` (ตอนนี้ว่าง; sequence ใช้แทนได้สำหรับ linear)

**กลุ่ม B — ตารางใหม่ (ทำเมื่อจะเปิด feature นั้น)**
- [ ] **work_calendar** (กะ/วันหยุด/downtime) → non-working shading + finite ที่แม่น
- [ ] **mrp_workcenter_line / eligibility** → alternate resource (FJSP), load-balance ข้ามไลน์
- [ ] **work_order_dependency** → cross-WO precedence + inter-job (assembly↔part)
- [ ] **skill matrix** + labor master/pool → constraint คน/ทักษะ
- [ ] **setup/changeover matrix** → sequence-dependent setup
- [ ] **scheduler_config** → horizon, objective weights, tolerance

**กลุ่ม C — รอจากระบบอื่น**
- [ ] **Material inventory/lead-time** → จาก Odoo (ตอนนี้ `earliest_start_at` proxy ไปก่อน)

---

## ข้อสรุปสำหรับการตัดสินใจ

1. ถ้าเป้าคือ **รัน finite backward scheduler v1** (เป้าหมาย SSI) → **input พร้อมแล้ว** (กลุ่ม 🔴 ครบ + populate) เริ่มได้โดยไม่ต้องรอกลุ่ม A/B
2. ถ้าจะให้ **ตารางสมจริงขึ้น** → เติมกลุ่ม A ก่อน (setup, op-type, capacity) — ถูกและเร็ว
3. Feature ขั้นสูง (alternate resource, skills, DBR, sequence-dep setup) → กลุ่ม B เมื่อถึงเฟสนั้น
