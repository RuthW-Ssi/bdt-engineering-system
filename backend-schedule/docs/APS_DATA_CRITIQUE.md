# บทวิพากษ์ข้อมูล Process Routing vs Layout — มุมมอง Production / Process Engineer

## สรุปประเด็น
`process routing.xlsx` เป็น **planning-level (4 process-area)** แต่ Layout BIF เป็น **machine-level (~18 เครื่อง + parallel line)**. ข้อมูล routing **ยังไม่ครบ** สำหรับทำ finite-capacity scheduling จริง.

---

## 1. 🔴 ช่องว่างใหญ่สุด — Front-end (material prep / machining) หายไปทั้งท่อน
Excel ลงรายละเอียด activity แค่ **buildup → assembly → paint**. **ไม่มี** standard-time/activity ของ:
`cutting` (Plasma 6m×2, 2.5m, Pipe, Band saw) · `drilling` · `punching` · `tapping` · `pressing/bending` · `straightening`
— ทั้งที่ Layout โชว์เป็น **เครื่องจักรหลัก (capital ก้อนใหญ่สุด)** ของโรง.

**ผลกระทบ:**
- scheduler มองไม่เห็นคอขวดที่ cutting/drilling (มักเป็นคอขวดจริงของ steel fab)
- material-availability-date (ป้อนเข้าด่าน buildup) คำนวณไม่ได้ → WIP/precedence เพี้ยน
- routing sheet มี Drill/Threading/Bending/Prepare แต่ **ไม่มี activity breakdown** → เป็นแค่ชื่อ ไม่มีเวลา

> นี่คือ **blocker ที่ต้องแก้ก่อน** — ต้องทำ standard-time study ของด่าน prep เพิ่ม

## 2. 🟠 Granularity ขัดกัน — 4 area (Excel) vs ~18 machine (Layout)
| | Excel | Layout |
|---|---|---|
| WC | Prepare/Buildup/Assembly/Painting (4) | CNC×3, Pipe, Saw, Press×2, Punch, Drill, Tap, H-beam, Straighten, Weld×n, Grind, Blast, Paint (~18) |
| line | — | ขนาน: CNC 6m×2, Press 110T/200T, fab bay หลายช่อง |

finite-capacity scheduling ต้องการ **machine-level** (แต่ละเครื่อง = resource จำกัด มีคิว/คอขวดของตัวเอง). โมเดล 4-area **ซ่อน parallel capacity + คอขวด** → ตารางไม่แม่น.

**✅ ข้อเสนอ reconcile:** ใช้ `mrp_workcenter.parent_id` (มีใน schema อยู่แล้ว) ทำ **2 ระดับ**:
- **parent** = process-area (4) → routing/planning วางที่ระดับนี้ (ตรง Excel)
- **child** = machine/station (~18) + `mrp_workcenter_line` → scheduler drill-down จัดเครื่องจริง (ตรง Layout)
→ ได้ทั้ง planning view (Excel) และ finite scheduling (Layout) ในโครงเดียว

## 3. 🟠 ข้อมูลไม่ครบระดับ activity
| ขาด | ผล |
|---|---|
| **machine ต่อ activity** (ro_op_act_me ช่อง machine ~ว่าง) | ผูก activity กับเครื่องจริงไม่ได้ → จัดเครื่องไม่ได้ |
| **skill** (มีแต่ `manpower` = จำนวน ไม่บอกชนิด) | labor/skill-constrained scheduling ไม่ได้ |
| **setup / changeover** (ไม่มีเลย) | machine occupancy ต่ำกว่าจริง — CNC โหลดโปรแกรม, press เปลี่ยน die, weld ตั้ง WPS/preheat |
| **std_measure ดูเป็น default** (500/6/120) | ต้องผูก measure จริงต่อชิ้น (position-code มี weight/surface_area/length) ไม่งั้น cycle time ไม่สมจริง |

## 4. 🟡 คุณภาพข้อมูล
- `routing` sheet มี **"False"** = artifact (น่าจะ boolean ผิด) → routing ควร base บน **product_code (14 ชนิดใน standard code) × zone**
- **ชื่อ operation 2 sheet ไม่ตรง** (routing: Drill/Build/Fit/Grind/Primer... vs activites: buildup_fit/welding/fitup/...) → ต้องมี canonical taxonomy เดียว
- **Inspect + Record ท้ายทุก operation** → จัด `kind='inspect'` (non-value-add) แยกออกจาก value-add time
- per_measure/ratio มีหลายหน่วยปน (kg, m, point, piece, m²) → ต้อง normalize unit dictionary

## 5. 🟢 ส่วนที่ดี (เก็บไว้/ต่อยอด)
- **parameter-driven standard time** (`per_minute × measure`, ratio = buildup_weight / welding_length / product_area...) = หลัก Industrial Engineering ที่ถูกต้อง — ดีกว่า flat duration
- เก็บ **idle time** + **manpower** ครบ
- activity-level breakdown ละเอียดสำหรับ buildup/assembly/paint (ใช้ได้เลย)

---

## สิ่งที่ต้องปรับปรุง (เรียงตาม priority)
| # | ปรับปรุง | ใคร/อย่างไร |
|---|---|---|
| 1 | **เติม routing ด่าน prep** (cut/drill/form/punch/tap/bend/straighten) + standard-time | ต้อง IE study เพิ่ม (จากของเดิม 18-WC หรือจับเวลาใหม่) |
| 2 | **โครง WC 2 ระดับ** (area parent + machine child via `parent_id`) + lines จาก Layout | ผมทำได้เมื่อมีรายการเครื่อง/line ยืนยัน |
| 3 | **assign machine + skill + setup ต่อ activity/operation** | machine_equipment(219)→machine_id; map op→skill; setup ต่อเครื่อง |
| 4 | **ผูก measure จริง** (position-code weight/area/length) เข้า cycle-time | ตอน generate WO |
| 5 | **clean routing** (ตัด False, base product_code × Accesory/Main) | — |

## คำถามที่ต้องถามเจ้าของข้อมูล (process owner)
1. ด่าน cutting/drilling/forming — มี standard time ที่ไหน หรือต้องจับเวลาใหม่?
2. ต้องการ schedule ระดับ **เครื่อง** (machine) หรือ **area** (4 WC)? → กำหนด granularity
3. skill ต่อแต่ละ operation ใครเป็นคนกำหนด (manpower บอกจำนวนแล้ว)
4. "False" routing คืออะไร · product 14 ชนิด ใช้ routing Accesory/Main อันไหน

---
*บทวิพากษ์ — ยังไม่แก้ DB*
