# APS New Model — Standardize + Entry Plan (จาก process routing.xlsx + Layout BIF)

## 1. Source → Target mapping (sheet ไหน → table ไหน)
| sheet (rows) | → target table | ใช้ field |
|---|---|---|
| `routing` (27) + `workcenter` (5) | **mrp_workcenter** + operation list | Work Center, Operation |
| `activites` (61) | **activity** (+ measure) + **activity_skill** | operation, description, per_minute, ratio, unit, std_measure, **manpower** |
| `ro_op_act_me` (41) | **operation_template_activity** (routing→op→act ลำดับ) + machine link | routing, sequence, operation, activity desc, per_minute, parameter, machine&equipment, part_code |
| `machine_equipment` (219) | **equipment_resource** (activity.machine_id) | name, model, serial, category |
| `parameter` / `activities_parameter` | measure/parameter (cycle-time driver) | ratio drivers |
| `consumable` | activity_consume / required_consumable | — |
| `position-code` (1731) | assemblies → MO/WO (**ภายหลัง** ไม่ใช่ spine) | AssemblyPosition, weight, zone, seq |
| `standard code` (14) | product/zone codes (BOM) | product_code, zone_code |

---

## 2. Standardized model (ข้อเสนอ)

### 2.1 Work Center — **4 ตัว** (process-area, ไม่ใช่ machine-level เดิม)
| code | name | จากเดิม |
|---|---|---|
| `WC-PREPARE` | Prepare Material (cut/drill/threading/bending) | Prepare Material |
| `WC-BUILDUP` | Built Up (H-beam build + weld) | Built Up |
| `WC-ASSEMBLY` | Assembly (fit-up + weld + grind) | Assembly |
| `WC-PAINTING` | Painting (blast + primer + paint) | Painting |

### 2.2 Operation (operation_template) — ระดับ activity-group
| op_code | WC | op_type (เสนอ) |
|---|---|---|
| `OP-BUILDUP-FIT` (buildup_fit) | WC-BUILDUP | Build |
| `OP-BUILDUP-WELD` (buildup_welding) | WC-BUILDUP | Weld |
| `OP-FITUP` (fitup) | WC-ASSEMBLY | Fit |
| `OP-WELDING` (welding) | WC-ASSEMBLY | Weld |
| `OP-BLAST` (painting 7.x) | WC-PAINTING | Blast |
| `OP-PAINT` (painting 8.x) | WC-PAINTING | Paint |
| *(+ จาก routing sheet)* Drill/Build/Threading/Bending/Primer/Fireproof/Topcoat/Grinding/Finishing | map เข้า 4 WC | Drill/Weld/Paint/Grind/Finish |

### 2.3 Activity (61) — detailed step + parameter cycle-time
แต่ละ activity มี: `description` · `per_minute` (rate) · `ratio` (measure driver) · `unit` · `std_measure` (qty มาตรฐาน) · `manpower` (headcount)
> **เวลา = per_minute × measure-qty** (measure-qty มาจาก ratio เช่น buildup_weight, product_welding_length, product_area ของชิ้นงานจริง) — richer กว่า flat duration เดิม

### 2.4 op_type taxonomy (เสนอ — derive จาก operation)
`Prepare · Build · Fit · Weld · Grind · Blast · Paint · Inspect` (Inspect/Record เป็น activity ใน op ไม่ใช่ op แยก)

---

## 3. Entry requirements — ต่อ table (สิ่งที่ต้องใส่ + แหล่ง + ที่ขาด)

| table | entry (source) | ขาด/ต้องตัดสิน |
|---|---|---|
| **mrp_workcenter** (4) | code/name (เสนอข้างบน) · capacity_mode (WC-ASSEMBLY = nominal_crew?) | nominal_crew ของแต่ละ WC, parent/sequence |
| **mrp_workcenter_line** | **source ไม่มี line** — Layout BIF มี bay/เครื่องขนาน | นิยาม "line" = bay? หรือ 1 line/WC? |
| **mrp_op_type** | taxonomy ข้อ 2.4 | ยืนยันรายการ + color |
| **operation_template** (~6–15) | op_code, WC, op_type (ข้อ 2.2) | reconcile ชื่อ op 2 sheet (routing vs activites) |
| **operation_template_activity** (~61) | จาก `ro_op_act_me`/`activites`: sequence, source_activity, per_minute, measure(ratio), unit, std_measure | setup activity (ไม่มีใน source → เพิ่มเอง?) |
| **activity** (~61) | activity_code (gen), description, per_minute, kind, machine_id | **kind** (setup/run/move/inspect) — classify จาก description; machine_id จาก machine_equipment |
| **activity_skill** | **manpower** = qty; skill = derive จาก operation | **skill ต่อ operation** (manpower บอกจำนวน ไม่บอก skill) — ต้อง map op→skill |
| **equipment_resource** (219) | machine_equipment | category → type mapping |
| dependency: `parameter`/`activities_parameter` | measure drivers (ratio) | ต้องสร้าง parameter table? หรือเก็บใน measure/unit |
| dependency: `consumable` | activity_consume | qty/formula |
| **routing_template** + `mrp_routing_workcenter` | routing sheet (Accesory/Main/False) → ลำดับ operation ต่อ product | False = อะไร? + map operation ให้ตรง |

---

## 4. ประเด็นต้องตัดสิน (ก่อน entry)
1. **Operation naming:** ใช้ระดับ `activites` (buildup_fit/welding/fitup/welding/blast/paint) เป็นหลัก แล้ว map `routing` sheet (Drill/Build/Fit/Grinding/Primer...) เข้าไป — หรือใช้ routing sheet เป็นหลัก?
2. **WC line:** source ไม่มี → ทำ 1 line/WC, หรือแตก bay จาก Layout เป็น line?
3. **op_type list:** ยืนยัน taxonomy 2.4
4. **skill ต่อ operation:** manpower มี (qty) แต่ skill ไม่มี → map เอง (buildup_welding→Weld, fitup→Fit/Assembly, painting→Paint) ใช้ skill เดิม 18 ตัว หรือ position-code?
5. **parameter cycle-time:** รับโมเดล `เวลา = per_minute × measure` ไหม (ต้องมี measure-qty ต่อชิ้นงานตอน gen WO) หรือ flatten เป็น duration คงที่
6. **setup:** source ไม่มี setup activity → เพิ่ม kind='setup' เองต่อ operation ไหม
7. **routing:** Accesory/Main/False = อะไร, ผูกกับ product ไหน (standard code มี product_code)

---

## 5. ลำดับ entry (เมื่อตัดสินครบ) — ตาม APS_BUILD_SEQUENCE.md
op_type → WC → line → equipment → activity(+kind+machine) → activity_skill(manpower+skill) → operation_template → operation_template_activity(per_minute+measure) → routing → ⚙️snapshot → views

---
*แผน standardize + entry requirement — ยังไม่ลงมือ*
