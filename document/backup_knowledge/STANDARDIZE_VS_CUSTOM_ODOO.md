# Odoo Standardize vs Custom — Material Master (BDT)

> **Context:** Backend ใหม่จะเขียนเป็น **NestJS + PostgreSQL** ไม่ได้รัน Odoo จริง
> แต่จะ **ยืม design pattern จาก Odoo** (schema, naming, workflow, ECO, UoM, mail.thread)
> เอกสารนี้บอกว่า **อันไหนควรเลียน Odoo / อันไหนต้อง custom เฉพาะ BDT**
>
> **หลักตัดสินใจ 3 ข้อ:**
> 1. **Standard Odoo** — ทำตาม pattern ของ Odoo เป๊ะ → integrate ง่าย, ทีมใหม่เข้าใจเร็ว, เผื่อย้ายไป Odoo จริงในอนาคต
> 2. **Hybrid** — ยืมโครง Odoo + extend field ของ BDT
> 3. **Custom** — เฉพาะ BDT ไม่มีใน Odoo

---

## 1. สรุปภาพรวม (Decision Matrix)

| Entity / Feature | Standardize ตาม Odoo | Hybrid (Extend) | Custom (BDT only) |
|---|:-:|:-:|:-:|
| Product Master schema convention | ✅ | | |
| UoM (หน่วยนับ 20 ตัว) | ✅ | | |
| Product Category / Group tree | | ✅ | |
| Chart of Account (รหัสบัญชี 61311 ฯลฯ) | ✅ | | |
| BOM / mrp.bom structure | ✅ | | |
| Routing / Work Center | ✅ | | |
| ECO (Engineering Change Order) | ✅ | | |
| State / Workflow naming | | ✅ | |
| Audit log (mail.thread pattern) | ✅ | | |
| Versioning convention | ✅ | | |
| RBAC / res.groups pattern | ✅ | | |
| **Part Code 10-digit format** | | | ✅ |
| **Substitute Part rule (หลักที่ 4)** | | | ✅ |
| **Description format validator (UPPERCASE EN, 2 ส่วน + Spec H/B/TW/TF/T/D/C)** | | | ✅ |
| **Engineering Attributes per Group** | | ✅ | |
| **Common Part / Duplicate Detection** | | | ✅ |
| **Criticality (Spare Part / Fixed Asset)** | | ✅ | |
| **Steel Grade master (SS400, SM520, G550)** | | | ✅ |
| **BIM / Drawing reference** | | | ✅ |
| Approval workflow | | ✅ | |

---

## 2. สิ่งที่ควร **Standardize ตาม Odoo** (≈ 60%)

### 2.1 Product Master Schema Convention

ใช้ pattern เดียวกับ `product.template` / `product.product` ของ Odoo

| Field BDT (เรา) | Odoo equivalent | เหตุผล |
|---|---|---|
| `part_code` | `default_code` | Odoo เรียก internal reference, type string — เรา constrain เป็น 10 chars |
| `name_th` | `name` (translatable) | Odoo มี multi-lang ในตัว |
| `description` | `description_sale` / `description_purchase` | Odoo แยก description ใช้งานต่างๆ |
| `uom_code` | `uom_id` (m2o → uom.uom) | ✅ ลอกตรง |
| `category` | `categ_id` (m2o → product.category) | ✅ ลอกตรง |
| `status` | `state` | ทุก entity ใน Odoo มี `state` |
| `version` | (ใช้ `mrp.eco` revision) | ✅ ใช้ ECO pattern |
| `active` | `active` | soft delete pattern Odoo |
| `created_by/at`, `updated_by/at` | `create_uid/_date`, `write_uid/_date` | ✅ field มาตรฐาน Odoo |

> **Implementation:** ตั้ง column ตาม Odoo naming เลย (`default_code`, `categ_id`, `uom_id`, `state`, `active`, `create_uid`, `write_uid`) — ทำให้ schema export ไป Odoo ภายหลังเป็น 1:1

### 2.2 UoM (หน่วยนับ 20 ตัว) — ✅ ใช้ Odoo Pattern เป๊ะ

```sql
-- Odoo pattern
CREATE TABLE uom_category (             -- เช่น Length, Mass, Volume, Quantity
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(40) NOT NULL
);

CREATE TABLE uom_uom (                  -- 20 หน่วยจากคู่มือ
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(40) NOT NULL,     -- 'Each', 'Kilograms', ...
  category_id INT REFERENCES uom_category(id),
  factor      NUMERIC(12,6) NOT NULL,   -- conversion factor
  uom_type    VARCHAR(10) NOT NULL,     -- 'reference' | 'bigger' | 'smaller'
  rounding    NUMERIC(12,6) DEFAULT 0.01
);
```

**ทำไม Odoo:** ระบบ stock + procurement ทุกที่ใช้ UoM แบบนี้ — convert ระหว่างหน่วยอัตโนมัติ (เช่น ซื้อ Drum ขาย Litre)

### 2.3 Product Category Tree — Hybrid (parent_id + custom fields)

Odoo `product.category` เป็น **tree (parent_id)** อยู่แล้ว — เหมาะกับ "13 กลุ่ม + Subgroup"

```sql
CREATE TABLE product_category (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(80) NOT NULL,         -- 'พนักงานและกิจกรรมต่างๆ' / 'Employee Recreation'
  parent_id       INT REFERENCES product_category(id),    -- Odoo pattern
  complete_name   VARCHAR(200),                 -- auto: '1 / 1.1 Employee Recreation'
  -- ↓↓↓ Custom fields (BDT) ↓↓↓
  group_no        VARCHAR(10),                  -- '1', '1.1' — BDT specific
  prefix_5        CHAR(5) UNIQUE,               -- 5-digit prefix สำหรับ Part Code
  account_code    VARCHAR(10) REFERENCES account_account(code),  -- 61311 ฯลฯ
  needs_criticality BOOLEAN DEFAULT FALSE
);
```

**Standard ส่วน:** tree (parent_id), name, complete_name
**Custom ส่วน:** `prefix_5`, `account_code` mapping, `needs_criticality`

### 2.4 Chart of Account (รหัสบัญชี 61311, 69101, ...)

Odoo มี `account.account` อยู่แล้ว → **ใช้ pattern เดียวกัน** จะเชื่อมกับ Finance ในอนาคตง่าย

```sql
CREATE TABLE account_account (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(10) UNIQUE NOT NULL,   -- '61311', '69101', '62411'
  name      VARCHAR(120) NOT NULL,
  account_type VARCHAR(40) NOT NULL        -- 'expense', 'asset', ...
);
```

### 2.5 BOM Structure (Future Sprint)

ใช้ `mrp.bom` + `mrp.bom.line` ของ Odoo เป๊ะ — codebase เรามี `BomNode` แล้วเก็บ recursion ใน frontend แต่ schema BE ควรเป็นแนว Odoo:

```
mrp_bom        (id, product_tmpl_id, product_qty, type, ...)
  └── mrp_bom_line (id, bom_id, product_id, product_qty, product_uom_id, sequence)
```

### 2.6 ECO (Engineering Change Order)

`Versioning` ของ BDT ใน UI (เช่น v1.0.0 → v1.2.0) ควรใช้ pattern `mrp.eco` ของ Odoo — มี state machine + approval ในตัวอยู่แล้ว

| Odoo state | BDT mapping |
|---|---|
| `confirmed` (Draft) | Draft |
| `progress` (Approval) | PendingReview |
| `done` | Active |
| `rebase` / `effective` | (รอ effective date) |

### 2.7 Audit Log — ใช้ `mail.thread` Pattern

Odoo ทุก entity ที่ inherit `mail.thread` จะได้ free:
- Activity log (ใครแก้อะไร เมื่อไหร่)
- Comment / message
- Subscriber (ติดตามการเปลี่ยนแปลง)

NestJS เลียน:
```sql
CREATE TABLE mail_message (
  id          BIGSERIAL PRIMARY KEY,
  model       VARCHAR(60) NOT NULL,        -- 'material'
  res_id      INT NOT NULL,                -- material id
  message_type VARCHAR(20),                -- 'notification' | 'comment' | 'audit'
  body        TEXT,
  tracking    JSONB,                       -- field changes [{field, old, new}]
  author_id   VARCHAR(60),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

ใน UI, tab "ประวัติ" ของ `ProductDetail.tsx` map ตรงกับ pattern นี้

### 2.8 RBAC — `res.groups` Pattern

Odoo มี groups + ir.rule (record rule) ที่ทำ row-level security เก่ง

| Role BDT | Odoo group equivalent |
|---|---|
| Requestor (ผู้ออกใบ Requirement) | `Sales / User` style — สร้างได้ แก้ของตัวเองได้ |
| Reviewer (ทีมตรวจสอบ) | `Stock / Manager` — อนุมัติ/ปฏิเสธ |
| Warehouse (run number) | `Stock / Inventory Manager` — ออก run number |
| Engineer (Substitute Part) | `MRP / User` |

### 2.9 State Machine Naming

ใช้ลำดับ state แบบ Odoo:
```
draft → to_approve → confirmed → done | cancel
```

BDT mapping ที่มีอยู่ (`Draft`, `PendingReview`, `Active`, `Rejected`, `Blocked`) — แนะนำเพิ่ม alias ใน DB:
- `Draft` ↔ `draft`
- `PendingReview` ↔ `to_approve`
- `Active` ↔ `confirmed`
- `Rejected` ↔ `cancel`
- `Blocked` ↔ `blocked` (custom — Odoo ไม่มี แต่ใกล้กับ `archived`)

### 2.10 Versioning Field

ใช้ `version` แบบ string `1.2.0` (semver) — แต่ trigger เพิ่มเลขผ่าน ECO ตาม Odoo แทน manual increment

---

## 3. สิ่งที่ต้อง **Custom** เฉพาะ BDT (≈ 30%)

### 3.1 Part Code Format 10 หลัก ⭐ Critical Custom

> **Odoo `default_code` ไม่มี structure** — เป็น free string  
> BDT มีกฎเฉพาะ: 5 group prefix + 5 run number, หลักที่ 4 = substitute flag

```typescript
// part-code.generator.ts (NestJS service - 100% custom BDT)
class PartCodeGenerator {
  generate(groupCode: string, isSubstitute = false, originalCode?: string): string {
    const prefix5 = await this.lookupPrefix(groupCode);  // 5 หลักจาก group master
    if (isSubstitute && originalCode) {
      // เปลี่ยนเฉพาะหลักที่ 4 ของรหัสเดิม
      return originalCode.slice(0,3) + this.nextSubstituteDigit(originalCode) + originalCode.slice(4);
    }
    const runNo = await this.nextRunNumber(prefix5);  // จองโดยคลังวัสดุ
    return prefix5 + runNo.toString().padStart(5, '0');
  }
}
```

**ทำไม Custom:** กฎเฉพาะ BDT, Odoo `default_code` ไม่มี constraint — ต้องเขียนเอง

### 3.2 Substitute Part Rule (เปลี่ยนเฉพาะหลักที่ 4) ⭐ Critical Custom

ไม่มีใน Odoo (Odoo มี `product.alternative` แต่ link ตาม `product_tmpl_id` ไม่ใช่ encode ในรหัส)

```sql
ALTER TABLE materials ADD COLUMN substitute_for CHAR(10) REFERENCES materials(part_code);
ALTER TABLE materials ADD COLUMN substitute_seq INT;       -- หลักที่ 4 (1-9)

-- constraint: ถ้า substitute_for IS NOT NULL → part_code ต้องเหมือน substitute_for ทุกตำแหน่ง
-- ยกเว้นหลักที่ 4
```

### 3.3 Description Format Validator ⭐ Custom

> **Odoo:** `name` field free string, ไม่ validate format
> **BDT:** ภาษาอังกฤษพิมพ์ใหญ่ + 2 ส่วน (ชื่อหลัก + Spec/H/B/TW/TF/T/D/C)

```typescript
// description.validator.ts
const DESC_REGEX = /^[A-Z0-9][A-Z0-9 \-=×.]+(\s(SS\d+|SM\d+|G\d+|A\d+|S\d+))?(\s[HBCDT][WF]?=\d+(\.\d+)?)*$/;

function validateDescription(s: string): ValidationResult {
  if (!/^[A-Z]/.test(s)) return fail('ต้องขึ้นต้นด้วยตัวพิมพ์ใหญ่ภาษาอังกฤษ');
  if (/[ก-๙]/.test(s)) return fail('ห้ามใช้อักษรไทย');
  const parts = s.split(/\s+/);
  if (parts.length < 2) return fail('ต้องมี 2 ส่วน: ชื่อหลัก + Spec/Dimensions');
  return ok();
}
```

### 3.4 Engineering Attributes Per Group ⭐ Hybrid → Custom Validator

Odoo มี `product.attribute` + `product.attribute.value` (variant system) — แต่เป็น **discrete options** (สี/ไซส์)

BDT ต้องการ **continuous numeric** (H=300mm, TW=6.5mm) → ใช้ JSONB + JSON Schema validation per group

```typescript
// attributes-by-group.schema.ts (custom)
const SCHEMAS_BY_GROUP: Record<MaterialGroup, JSONSchema> = {
  HR_SHAPE: {
    required: ['grade', 'height_h', 'width_b', 'web_tw', 'flange_tf'],
    properties: {
      grade: { enum: ['SS400','SM490','SM520','SM570','A36'] },
      height_h: { type: 'number', minimum: 50, maximum: 1500 },
      width_b:  { type: 'number', minimum: 50, maximum: 500 },
      web_tw:   { type: 'number', minimum: 3,  maximum: 50 },
      flange_tf:{ type: 'number', minimum: 3,  maximum: 50 },
    }
  },
  PLATE: {
    required: ['grade', 'thickness_t', 'width_mm', 'length_mm'],
    properties: { /* ... */ }
  },
  COLDFORM: {
    required: ['grade', 'height_h', 'width_b', 'lip_c', 'thickness_t'],
    /* ... */
  },
  // ... 13 groups
};
```

> **Hybrid:** ใช้ JSONB column (Odoo-style flexible field) + custom validator

### 3.5 Common Part / Duplicate Detection ⭐ Custom

Odoo มี basic search แต่ไม่ smart — BDT ต้องตรวจ "ใกล้เคียง" ตาม attributes

```typescript
// duplicate-detector.service.ts
async findDuplicates(input: CreateMaterialDto): Promise<Material[]> {
  const tolerance = 0.05;  // ±5%
  return this.repo
    .where('group_code = :g', { g: input.group_code })
    .where('attributes @> :grade', { grade: { grade: input.attributes.grade } })
    .andWhere(buildDimensionTolerance(input.attributes, tolerance))
    .limit(5)
    .getMany();
}
```

**ทำไม Custom:** ตรรกะใกล้เคียงเฉพาะของแต่ละ group (HR_SHAPE เทียบ H+B+TW+TF, PLATE เทียบ T+W+L)

### 3.6 Criticality สำหรับ Spare Part / Fixed Asset ⭐ Custom

Odoo มี `priority` (0-3) แต่ไม่มีตามคู่มือ BDT — ทำเป็น hybrid

```sql
-- Odoo-style priority + custom criticality
ALTER TABLE materials ADD COLUMN priority CHAR(1);            -- '0','1','2','3' (Odoo)
ALTER TABLE materials ADD COLUMN criticality VARCHAR(10);     -- 'A','B','C' (BDT custom)
ALTER TABLE materials ADD COLUMN criticality_reason TEXT;     -- ตามตารางคู่มือ
```

### 3.7 Steel Grade Master ⭐ Custom

Odoo ไม่มี table นี้ — สร้างใหม่:

```sql
CREATE TABLE steel_grade (
  code        VARCHAR(20) PRIMARY KEY,    -- 'SS400', 'SM520', 'G550'
  standard    VARCHAR(20),                -- 'JIS G3101', 'JIS G3106', 'AS 1397'
  yield_mpa   NUMERIC(6,1),
  tensile_mpa NUMERIC(6,1),
  notes       TEXT
);
```

### 3.8 BIM / Drawing Reference ⭐ Custom

Odoo ไม่มี — เพิ่ม field

```sql
ALTER TABLE materials ADD COLUMN drawing_ref VARCHAR(60);
ALTER TABLE materials ADD COLUMN bim_object_id VARCHAR(80);    -- IFC GUID
ALTER TABLE materials ADD COLUMN bim_classification VARCHAR(40); -- Uniclass / OmniClass
```

---

## 4. สิ่งที่เป็น **Hybrid** (≈ 10%)

### 4.1 Workflow Approval

| ส่วน | Standard / Custom |
|---|---|
| State machine + transition | ✅ Standard (Odoo `state` field + `_track_subtype`) |
| Reviewer assignment | ✅ Standard (`mail.activity.type`) |
| **กฎ: คลังวัสดุเท่านั้นที่ออก run number 5 หลัก** | ❌ Custom (BDT-specific role) |
| Approval matrix per group | ✅ Standard (Odoo `studio.approval`) |

### 4.2 Multi-currency / Cost

ระบบเหล็กราคาเปลี่ยนตามตลาด — Odoo มี `standard_price` + `list_price` + currency conversion อยู่แล้ว → **ใช้ตรง**

ส่วน "ราคาตลาดเหล็ก SS400 ปัจจุบัน" → **Custom** (อาจดึงจาก SET หรือ market data)

### 4.3 Inventory Locations

Odoo `stock.location` tree → ใช้ตรง (Internal / Customer / Vendor / Production)
"คลังวัสดุ A3" / "Zone A" → custom data ใน table นี้

---

## 5. สรุปแบบทีละชั้น (Layer-by-layer)

### Layer 1 — Database Schema (Postgres)
- ✅ **80% Standard Odoo:** `default_code`, `name`, `state`, `active`, `categ_id`, `uom_id`, `create_uid`, `write_uid`, tree (`parent_id`, `complete_name`)
- ❌ **20% Custom:** `prefix_5`, `account_code` mapping, `substitute_for`, `criticality`, `bim_object_id`, `drawing_ref`

### Layer 2 — API / NestJS Module
- ✅ **70% Standard:** REST naming `/materials`, `/uoms`, `/categories`, pagination + filter style
- ❌ **30% Custom:** `/materials/:code/generate-part-code`, `/materials/:code/substitute`, `/materials/duplicates-check`

### Layer 3 — Validation Rules
- ✅ **40% Standard:** UoM enum, Category FK, state transition
- ❌ **60% Custom:** Part code format, description regex, attributes per group, duplicate detection algorithm

### Layer 4 — Frontend (React)
- ✅ **50% Standard:** List/detail pattern, status pill, action buttons (เลียน Odoo Web)
- ❌ **50% Custom:** Form ฟิลด์ engineering (H, B, TW, TF, T, D, C), 5-digit prefix preview, substitute part picker

---

## 6. Recommendation — ลำดับความสำคัญในการตัดสินใจ

| ลำดับ | เรื่อง | ทำไม |
|---|---|---|
| 1 | **ตั้ง column ตาม Odoo naming ให้มากที่สุด** | export → Odoo จริงในอนาคตทำได้ 1:1 ไม่ต้อง remap |
| 2 | **Custom เฉพาะตรงที่กฎคู่มือบังคับ** (Part Code, Description, Substitute, Common Part) | ตรงนี้ Odoo ไม่ตอบโจทย์ |
| 3 | **อย่าเพิ่ง custom workflow** — ใช้ Odoo state machine ปกติก่อน | flexibility ดี + ทีมเข้าใจง่าย |
| 4 | **Attributes per Group ใช้ JSONB + JSON Schema** | flexible พอที่จะรองรับ 13 groups โดยไม่ต้องสร้าง table แยก แต่ validate strict ต่อ group |
| 5 | **เผื่อ Odoo Migration:** เก็บ `odoo_ref_id` ไว้ทุก entity | ถ้าวันหน้าเชื่อม Odoo จริง sync ได้ทันที |

---

## 7. Anti-pattern ที่ควรหลีกเลี่ยง

| Anti-pattern | ทำไมไม่ดี |
|---|---|
| ❌ สร้าง column สำหรับทุก attribute (`height_h`, `width_b`, `web_tw`, ...) | schema เปลี่ยนทุกครั้งที่เพิ่ม group ใหม่ |
| ❌ ใช้ `default_code` เก็บ part_code แบบ free string | สูญเสีย structure 10 หลัก |
| ❌ ทำ ECO เป็น log table ธรรมดา | สูญเสีย state machine + approval pattern ของ Odoo |
| ❌ Custom auth ใหม่ทั้งหมด (ไม่เลียน Odoo `res.users` + `res.groups`) | RBAC ยุ่งยาก พอจะ migrate |
| ❌ Hard-code 13 groups ใน enum TypeScript | เพิ่ม group ต้อง deploy ใหม่ — ใช้ master table แทน |

---

## 8. Decision Log Template (ใช้ใน Sprint Review)

```
| Decision | Standard / Hybrid / Custom | Rationale | Reviewer |
|---|---|---|---|
| ตั้ง column `default_code` แทน `part_code` | Standard | เผื่อ Odoo migrate | tech-lead |
| ใช้ JSONB สำหรับ attributes | Hybrid | flexible per group | architect |
| เขียน Part Code Generator เอง | Custom | กฎเฉพาะ BDT | PO + tech-lead |
```

---

*Prepared by: BDT Engineering — Architecture Decision Record (ADR) v0.1*
