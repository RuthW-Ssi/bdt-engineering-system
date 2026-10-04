# APS Routing Formula — Decision + Variable Spec (WIP)

วันที่: 2026-06-24 · สถานะ: **ออกแบบ ยังไม่ build resolver** (buildup formula PENDING — ติด BOM mark)

## 1. Decision: เมื่อไหร่คำนวณ time
**คำนวณตอน gen WO (MO release) = lazy materialize** → เขียนลง `work_order.expected_duration_min` (snapshot).
- scheduler อ่าน expected_duration_min (materialized) ไม่ eval formula ตอน solve → ตารางนิ่ง
- infra cache มีอยู่แล้ว: `mrp_routing_workcenter.formula_expr / time_cycle / time_cycle_manual / last_computed_at / cache_key`
- template เก็บ nominal (std_measure) ไว้ rough-cut; ตัวจริงคำนวณต่อ assembly ตอน gen WO
- **cache_key = hash(BOM attrs + routing version + rate)** → re-gen เฉพาะตัวที่ input เปลี่ยน

## 2. Contract: formula ใช้ "BOM attribute เท่านั้นเสมอ"
ทุกตัวแปร (measure) ต้อง resolve จาก `bom_assembly (+attributes jsonb)` + `Σ bom_part ผ่าน bom_assembly_part` เท่านั้น. resolver บังคับกฎนี้ที่ชั้นเดียว. ถ้า assembly ไหน attribute ไม่ครบ → validation gate block ก่อน gen WO.

## 3. Original formulas (จาก `process routing.xlsx` → sheet parameter / activities_parameter)
| parameter | สูตร original | resolve จาก BOM | สถานะ |
|---|---|---|---|
| buildup_weight | `sumWeight * 0.8` → **ปรับใหม่ (ดู §4)** | Σ part weight (w+f) | 🔴 pending (ติด mark) |
| buildup_perimeter | `(Length*2)+(Width*2)` → **ปรับใหม่ (ดู §4)** | web part ใหญ่สุด | 🔴 pending (ติด mark) |
| product_perimeter | `(Length*2)+(Width*2)` | length_mm,width_mm (assembly) | 🟢 derive |
| buildup_weldingpoint | `2*(Length/0.2)` | length_mm | 🟢 derive |
| product_length / part Length | `Length` | length_mm | 🟢 |
| product_area | `sumNet_surface_area` | surface_area_m2 | 🟢 |
| dimeter | `Hight` | height_mm | 🟢 |
| part_quan / assembly_point / จำนวน joint / จุดการเชื่อม | `count_part` / `part*2` | count(bom_assembly_part) | 🟢 count |
| per unit | `FIX number` | คงที่ ×1 | 🟢 const |
| **buildup_weldingsize** | `manaul cal` | — | 🟡 **PENDING** |
| **product_welding_length** | `manaul cal` | (weld_length_m col มี แต่ original คำนวณมือ) | 🟡 **PENDING** |
| **ความยาวแนวเชื่อม pipe** | `pipe_perimeter` (π×OD) | parse bom_part.profile (PIPE…) | 🟡 **PENDING** |
| **ความยาวแนวเชื่อมที่เหลือ** | `manaul_cal` | — | 🟡 **PENDING** |
| **type paint** | `TYPEPAINT` | Dispatch Note มี / bom_assembly ไม่มี col | 🟡 **PENDING** |
| **section_perimeter** | (ว่าง) | — | 🟡 **PENDING** |

## 4. นิยามที่ BDT ปรับ (2026-06-24)
- **buildup_weight** = ผลรวมน้ำหนักของ part mark ที่มี **w (web)** กับ **f (flange)** ก่อน suffix running number ใน assembly นั้น (e.g. `TH-2w32`)
- **buildup_perimeter** = `(Length*2)+(Width*2)` ของ part **w (web)** ที่ **ขนาดใหญ่สุด** ใน assembly นั้น
- buildup_weldingsize / product_welding_length / ความยาวแนวเชื่อม pipe / ความยาวแนวเชื่อมที่เหลือ / type paint / section_perimeter = **pending ไว้ก่อน**

## 5. 🔴 BLOCKER (ทำให้ buildup formula รันไม่ได้ตอนนี้)
ข้อมูล BOM ใน DB (project **TH-2**, assembly 235 / part 520 / assembly_part 1349) **ไม่มี mark w/f**:
- part โครงสร้างทั้งหมด mark = **`p`** (plate) เหมือนกันหมด — taxonomy: **p 379 (plate), FB 68 (angle L50), m/M 60 (rod/coupling), WH 13 (แผ่นเล็ก 60mm)**. ไม่มี `w` ไม่มี `f`
- ตัวอย่าง built-up จริง **TH-2RF4 (RAFTER)**: web=`TH-2p4` PL8x**962** (345.6kg), flange=`TH-2p9/p10` PL8x150 — **ทุกตัว mark "p"** แยก web/flange ด้วย mark ไม่ได้
- **width อยู่ใน profile string** (`PL8x962`→962) ไม่ใช่ column — `bom_part` ไม่มี `width_mm` → ต้อง parse profile

**ทางเลือก (BDT เลือก pending):**
- (A) geometry heuristic: web = plate กว้างสุด/ยาวเต็มตัว, flange = plate ยาวเต็มตัวถัดไป (รันบนข้อมูลปัจจุบันได้ ไม่ต้อง re-import)
- (B) re-import BOM ให้ detailer export Tekla พร้อม mark web=w / flange=f (ตรงสูตร แต่ปัจจุบันใช้ไม่ได้)

## 6. สิ่งที่ต้องทำเมื่อ resume
1. ตัดสิน web/flange identification (A geometry / B re-import)
2. parse `bom_part.profile` → thickness, width (PL{t}x{w}); pipe OD (PIPE{od}x{t}); angle/rod
3. สร้าง `formula_variable` dictionary (name · grain assembly/part/agg · bom_path · unit · agg_func) = สัญญา
4. resolver ตอน gen WO (BOM-only) + validation gate
5. เคลียร์ pending vars (weldingsize/weld_length/pipe/type paint/section_perimeter) — เพิ่ม column หรือ attributes jsonb + ให้ import เติม

*spec — ยังไม่แตะ DB (buildup PENDING)*
