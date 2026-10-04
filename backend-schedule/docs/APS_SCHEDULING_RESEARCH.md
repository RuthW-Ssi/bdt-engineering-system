# APS Scheduling — หลักการโลก + กรอบออกแบบ solver (SSI steel fab)

วันที่: 2026-06-24 · เพื่อวางกรอบ #5 (solver test) ให้ตรงหลัก APS สากล (Siemens Opcenter/Preactor, Asprova, Simio + ตำรา job-shop scheduling)

---

## 1. 4 โหมด scheduling (กรอบ Preactor/Opcenter ที่ BDT อ้าง)

| โหมด | ทำงานยังไง | ได้อะไร | เหมาะเมื่อ | ข้อมูลต้องมี |
|---|---|---|---|---|
| **a. Forward** (ASAP) | วางจาก "วันนี้/วันเริ่ม" ไปข้างหน้า เร็วสุดเท่าที่ capacity ว่าง | เสร็จเร็วสุด, เห็น early finish | งานเร่ง, อยากรู้เร็วสุดทำได้แค่ไหน | earliest_start, duration, capacity, calendar |
| **b. Backward** (JIT/ALAP) | วางจาก **due date ถอยหลัง** ช้าสุดที่ยังทันส่ง | WIP/inventory ต่ำสุด, ส่งตรงเวลาพอดี | มี due date ชัด, อยากลด WIP | **target_end (due)**, duration, capacity, calendar, precedence |
| **c. Algorithmic sequencing** | ใช้ **อัลกอริทึม/optimization** จัดลำดับเพื่อ min objective (lateness/changeover) | ตารางดีสุดตาม objective | มี objective ชัด + ยอมรับเวลา solve | objective weights, setup matrix, constraints |
| **d. Event-based sequencing** | เดินไทม์ไลน์แบบ **discrete-event**: ทุกครั้งที่ resource ว่าง → เลือกงานถัดไปด้วย dispatch rule | สมจริง, จัดคิวคอขวดเก่ง, เร็ว | dynamic/หลายคอขวด, อยาก realistic | dispatch rule, precedence, capacity, calendar |

> **a/b = ทิศทาง** (จะวางจากต้นหรือปลาย) · **c/d = วิธีตัดสินลำดับ** (optimize vs event/rule). จริง ๆ ผสมกันได้ เช่น "backward + event-based + EDD"

**SSI จะเทส: b (backward) + d (event-based) ก่อน** — เหตุผลถูกหลัก: backward = ลด WIP (เหล็กชิ้นใหญ่ เก็บ WIP แพง), event-based = จัดคอขวด (cutting/weld) สมจริง + เร็ว ไม่ต้องรอ optimizer

---

## 2. Dispatching rules (เลือกงานถัดไปในคิวของ line — หัวใจของ event-based)

| rule | กฎ | ดีต่อ KPI | ข้อเสีย |
|---|---|---|---|
| **EDD** (Earliest Due Date) | due ใกล้สุดก่อน | **min max lateness** (ส่งตรง) | ไม่สน workload |
| **CR** (Critical Ratio) | (เวลาเหลือถึง due)÷(งานเหลือ); <1=สาย | dynamic, ปรับ urgency ตามสถานการณ์ | คำนวณทุก event |
| **SPT** (Shortest Processing Time) | งานสั้นสุดก่อน | min flow time + **WIP** | งานยาวอดตาย (starvation) |
| **LPT** / **FIFO** / **Slack** | ยาวสุด / มาก่อน / slack น้อยสุด | balance / fair / due | แล้วแต่บริบท |
| **Min-setup** (sequence-dependent) | จัดเรียงลด changeover | **min setup**, throughput | อาจขัด due |

> **แนวปฏิบัติสากล:** backward (ทิศทาง) + finite-capacity (คุมคอขวด) + **EDD หรือ CR** (จัดคิว) = สูตรมาตรฐาน job-shop. **SSI แนะนำ default = EDD**, มี CR เป็นทางเลือก, setup-aware ทีหลัง

---

## 3. กลไก finite-capacity (สิ่งที่ solver ต้องเคารพ)

1. **Finite ≠ Infinite:** ห้ามวางเกิน capacity จริง (1 line = 1 งาน/เวลา) — ต่างจาก MRP ที่ assume capacity ไม่จำกัด
2. **Resource = line** (เราตกลงแล้ว): แต่ละ line ขนานกัน, 1 WO ครั้งละ 1 ที่ 1 line
3. **Calendar เดียว** (FACTORY-STD): กะ 08:00-12:00+13:00-17:30 (+OT→22:00), หยุด 15 วัน → duration ต้อง "ยืด" ข้ามช่วงพัก/วันหยุด
4. **Labor:** line มี crew_size (internal/subcontract) — ถ้าคุม labor: line ทำงานได้เมื่อ crew ≥ ต้องการ (เราเลือก soft constraint ได้)
5. **Precedence:** WO ใน MO เรียงตาม `sequence` (linear v1) — op ถัดไปเริ่มได้เมื่อ op ก่อนเสร็จ
6. **WIP buffer** (optional): ของรอระหว่าง WC มีที่จำกัด (wip_storage)
7. **Bottleneck:** ระบุคอขวด (load สูงสุด) → จัดคอขวดก่อน (Theory of Constraints / DBR)

---

## 4. Objectives (วัดว่า schedule ดีแค่ไหน — มีใน `scheduler_config` weights แล้ว)

| objective | นิยาม | SSI weight (ปัจจุบัน) |
|---|---|---|
| **Tardiness** | ผลรวม/มากสุดของความสาย (หลัง due) | **0.6** (ส่งตรงสำคัญสุด) |
| **Makespan** | เวลารวมจบงานทั้งหมด | 0.2 |
| **Setup** | เวลา changeover รวม | 0.1 |
| **WIP** | งานค้างระหว่างผลิต | 0.1 |
| (เพิ่มได้) Utilization / Throughput / Earliness (JIT) | ใช้เครื่องคุ้ม / ผลผลิต / ไม่เสร็จเร็วเกิน | — |

> multi-objective = ถ่วงน้ำหนักรวม (weighted sum) — เรามี weights แล้ว. heuristic ไม่ optimize ตรง ๆ แต่ **วัด KPI พวกนี้หลัง schedule** เพื่อเทียบ scenario

---

## 5. การเทส / validate schedule (ก่อนเชื่อผลลัพธ์)

1. **Feasibility checks:** ไม่มี 2 WO ทับเวลาเดียวกันบน line เดียว · อยู่ในกะ/ไม่ตกวันหยุด · precedence ไม่ย้อน · ไม่เกิน capacity
2. **Benchmark:** เทียบกับตารางที่ planner ทำมือ (ตรง/ดีกว่า?)
3. **Sensitivity:** ขยับ input (due, capacity) → ผลเปลี่ยนสมเหตุผลไหม
4. **Edge cases:** งาน overdue (due < วันนี้), คอขวดล้น, MO เดียวยาวมาก, rush order แทรก
5. **Reproducibility:** input เดิม → ผลเดิม (deterministic; ถ้ามี random ต้อง seed)
6. **Regression:** เก็บ baseline schedule ไว้เทียบเวอร์ชันถัดไป

---

## 6. Scenarios / What-if / Simulation (digital twin — จุดแข็งของ APS)

ผลิตหลายตาราง (`prod_schedule_version`) แล้วเทียบ KPI:

| scenario | ปรับอะไร | ตอบคำถาม |
|---|---|---|
| **Capacity +** | เพิ่ม line / crew / **flip line → subcontract** | "จ้าง weld subcontract เพิ่ม → makespan ลด/cost เพิ่มเท่าไหร่?" ← **line-labor toggle ของเราทำได้เลย** |
| **Demand surge** | เพิ่ม MO/rush order | รับงานเพิ่มได้ไหม ไม่ทำของเดิมสาย |
| **Disruption** | เครื่องเสีย / คนขาด / วันหยุดเพิ่ม | ผลกระทบ + แผนกู้ |
| **Due change** | ขยับ due date | คิวเปลี่ยนยังไง |
| **Dispatch rule** | EDD vs CR vs SPT | rule ไหนให้ KPI ดีสุดกับงานเรา |
| **Direction** | forward vs backward | early-finish vs low-WIP |

> เก็บแต่ละ run เป็น **version** + snapshot KPI → เทียบข้างกันใน cockpit. **subcontract-line toggle = what-if lever ที่ทรงพลังสุดของ SSI** (เชื่อมกับโมเดล labor ที่เพิ่งทำ)

---

## 7. KPIs ที่ cockpit ควรโชว์ (หลัง schedule)

- **On-Time Delivery %** · **Tardiness** (avg/max/จำนวน WO สาย) · **Makespan** (วันจบทั้งชุด)
- **Utilization %** ต่อ WC/line (busy ÷ available) · **Load vs Capacity** (#8 capacity visual)
- **Queue/Lead time** เฉลี่ย · **WIP** peak · **Setup %** · **Subcontract cost** vs internal
- **Bottleneck** (WC/line ที่ utilization สูงสุด)

---

## 8. กรอบ solver ที่เสนอสำหรับ SSI (v1 heuristic)

**Backward (b):**
1. anchor ทุก WO ที่ `target_end_at` (MO due, end-of-shift)
2. วาง op สุดท้าย→ต้น (ตาม sequence ย้อน) ที่ "ช้าสุดที่ยังว่าง" บน line ของ WC นั้น เคารพ calendar+capacity
3. ถ้า start < วันนี้ → **clamp = วันนี้ + flag LATE** (งาน overdue)
4. เลือก line ใน WC: line ว่างที่ทำให้ใกล้ due สุด (+ labor_mode/crew ผ่าน)

**Event-based (d):**
1. forward discrete-event จาก 2026-06-25 08:00
2. คิว "WO พร้อม" (precedence ครบ) ต่อ WC; ทุกครั้ง **line ว่าง → เลือกด้วย dispatch rule (default EDD)**
3. วางในกะ (ยืดข้ามพัก/วันหยุด), อัปเดต event ถัดไป, วน
4. finite-capacity เกิดเองตามธรรมชาติ (line ว่างทีละตัว)

**ทั้งคู่:** อ่าน `work_order`+`work_center_line_labor`(crew/mode)+calendar+`scheduler_config` → เขียน `prod_schedule` (1 version/scenario) → cockpit + KPI + capacity visual

---

## 9. Phasing (เทียบ roadmap BDT)

| เฟส | วิธี | สถานะ |
|---|---|---|
| **v1 (ตอนนี้)** | **heuristic**: backward + event-based dispatch (EDD/CR) | ผมเขียนเทสบน Supabase — เร็ว, โปร่งใส, baseline ดี |
| v2 | **metaheuristic** (GA/SA/Tabu) หรือ **CP-SAT/OR-Tools** | = แผน BDT Sprint 8+ (true optimization, algorithmic mode c) |

> heuristic v1 ครอบ **3/4 โหมด** (forward/backward/event-based) ได้เลย; algorithmic (c) แท้ ๆ รอ v2 OR-Tools

---

## สรุปทิศทาง
SSI เดินถูกหลักโลก: **backward + event-based + EDD** บน finite-capacity line + calendar เดียว เป็น baseline มาตรฐาน job-shop. ต่อยอด what-if ด้วย **subcontract-line toggle** (จุดแข็งเฉพาะตัว). optimization แท้ (OR-Tools) เป็น v2.

*Sources: Siemens Opcenter/Preactor (lean-scheduling.eu, ats-global.com, medium/leanschedulingsolutions), User Solutions (dispatching rules), Excellerant (finite capacity), Simio/JITBase (what-if digital twin + KPI).*
