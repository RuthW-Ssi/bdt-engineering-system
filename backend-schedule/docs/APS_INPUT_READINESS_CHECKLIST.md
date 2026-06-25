# APS — Input & Constraints Readiness Checklist

> 🚦 **Gate ก่อนเริ่ม Phase 0 (algorithm spike)** — ทุกข้อควรเป็น ✅ หรือมีคำตอบ/สมมติฐานที่ lock แล้ว
> คู่กับ `APS_PHASE_PLAN.md` · วันที่ 2026-06-17

**Legend:** ✅ มีในระบบ · ⚠️ ต้องยืนยัน/ตัดสินใจ · ❌ ยังไม่มี (ต้องเพิ่มถ้าจำเป็น) · ❗ data-quality gate ต้องเช็คกับข้อมูลจริง

---

## A. Demand — งานที่จะจัดตาราง (Jobs / WO)

- [ ] รายการ WO ที่จะ schedule: `job_id`, mark/product, `qty` — **แหล่ง: MO/WO ภายนอก (รอ BDT ชี้)** ⚠️
- [ ] **Release date / earliest start** ต่อ WO — วัตถุดิบพร้อมเมื่อไหร่? หรือสมมติพร้อมหมดที่ t0 ⚠️
- [ ] **Due date** ต่อ WO — `project_zone.target_erection_start/end`, `project.target_handover` ✅
- [ ] **Priority / weight** — `project_zone.erection_sequence`, `process routing.xlsx → order_to_erection / order_to_prod` ✅
- [ ] ขนาดโจทย์: 1 zone มีกี่ WO (กำหนด solver time budget) ⚠️

## B. Process — ขั้นตอนการผลิต (Routing)

- [ ] **Routing coverage**: ทุก product/mark ที่จะ schedule มี routing ครบไหม ❗ *(ไม่มี routing = schedule ไม่ได้ — gap ที่อันตรายสุด)*
- [ ] ลำดับ operation ต่อ routing — `mrp_routing_workcenter.sequence`, `op_code` ✅
- [ ] แต่ละ op ผูก work center — `mrp_routing_workcenter.workcenter_id` ✅
- [ ] **เวลา/op** — `time_cycle` (`time_mode=formula`, `formula_expr`) ✅ — ⚠️ ยืนยัน: เป็นเวลา **ต่อหน่วย** (ต้อง × qty) หรือ **ต่อ batch** แล้ว?
- [ ] ไม่มี `time_cycle = 0 / null` ในงานที่จะ schedule ❗
- [ ] หน่วยเวลา consistent (นาทีทั้งหมด) ⚠️

## C. Resource — เครื่อง / Work Center

- [ ] รายการ WC + **capacity** — `mrp_workcenter.capacity` (default 1) ✅
- [ ] **ปฏิทินทำงาน** ต่อ WC — `working_hours_per_week`, `time_start`, `time_stop` ✅ *(หยาบ)* — ⚠️ มี **กะ / วันหยุด / planned downtime** จริงไหม? ปัจจุบันไม่มีตารางกะ
- [ ] เครื่องไหน `capacity > 1` (ทำขนานได้) ⚠️
- [ ] เอา **efficiency/OEE มาคูณเวลา** ไหม — `time_efficiency`, `oee_target`, `availability/performance/quality` ⚠️ *(ตัดสินใจ: schedule บนเวลา ideal หรือ derated)*

## D. Constraints — เงื่อนไขที่ต้องเคารพ

- [ ] **Precedence ภายใน job** (op → op) — `blocked_by_op_ids[]` ✅ — ⚠️ ใช้แบบ linear ตาม `sequence` หรือเป็น DAG มี branch?
- [ ] **Machine no-overlap** (finite capacity) ✅ *(บังคับจาก capacity)*
- [ ] **Inter-job precedence**: WO ประกอบ (assembly) ต้องรอ WO ชิ้นส่วน (part) เสร็จก่อนไหม — `bom_assembly_part` / `AssemblyPart` ❗ ⚠️ *(สำคัญมากกับงานเหล็ก — ต้องตัดสินใจว่าจะ model ความสัมพันธ์ assembly↔part เป็น constraint ไหม หรือเฟสแรกถือทุก WO อิสระ)*
- [ ] **Setup time / sequence-dependent setup** (เปลี่ยนสีพ่น, เปลี่ยน fixture, warm-up) — ❌ ยังไม่มี field — ⚠️ ยืนยันว่ามีจริงไหม ถ้ามีต้องเพิ่ม schema + ข้อมูล
- [ ] **Alternate work center** (op ลงเครื่องสำรองได้) — ❌ ยังไม่มี → เฟสแรกถือเครื่องตายตัว (JSSP)
- [ ] **ข้อจำกัดคน/ทักษะ** (skilled operator มีจำกัด) — `labor_mix`, skeleton `personnel-skills` — ⚠️ defer เฟสแรก?
- [ ] **Hard vs soft due date** — สายได้ไหม / มี penalty อย่างไร ⚠️

## E. Objective — เป้าหมายการ optimize

- [ ] ฟังก์ชันเป้าหมายหลัก = **min total weighted tardiness**? ⚠️
- [ ] น้ำหนัก: lateness vs makespan vs utilization จัดลำดับยังไง ⚠️
- [ ] weight ของงาน = `erection_sequence`? ✅ *(มี field ให้ใช้)*

## F. Data-quality gates — ต้องผ่านก่อน solve (เช็คกับข้อมูลจริง)

- [ ] ทุก WO → มี routing · ทุก op → มี WC + `time_cycle > 0` ❗
- [ ] `blocked_by_op_ids` ชี้ไป op ที่มีจริง (ไม่ orphan) ❗
- [ ] ทุก WC ที่ถูกใช้ มี capacity + calendar นิยามไว้ ❗
- [ ] Due date มีจริง และ ≥ release date ❗
- [ ] ไม่มี **circular precedence** (ทั้ง intra-job และ inter-job) ❗
- [ ] qty > 0, ไม่มีหน่วยปนกัน ❗

---

## สรุป — 3 gap ที่ใหญ่สุด (ต้องเคลียร์ก่อน)

1. **WO source + routing coverage** (A1, B1) — ยังไม่รู้แหล่ง WO และยังไม่รู้ว่ากี่ % ของ mark มี routing → ถ้า coverage ต่ำ ต้องแก้ data ก่อน ไม่ใช่แก้ algorithm
2. **Inter-job precedence (assembly ↔ part)** (D3) — ตัดสินใจว่าเฟสแรก model ความสัมพันธ์นี้ไหม กระทบโครงสร้าง model ของ solver โดยตรง
3. **Setup time มีจริงไหม** (D4) — ถ้ามี (เช่น งานพ่นสีสลับสี) จะกระทบลำดับงานมาก ต้องเพิ่ม schema + เก็บข้อมูล

## วิธีเช็คอัตโนมัติ

Section **F + B1** (coverage/quality) เช็คด้วย SQL กับ Supabase ได้เลย — ถ้า BDT ชี้ project/zone ผมรัน query ตรวจ coverage %, time=0, orphan precedence, missing calendar ให้เป็นรายงานได้ทันที
