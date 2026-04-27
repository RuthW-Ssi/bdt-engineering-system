# แผน Sprint — Material Master Data & Material Registration

> **Project:** BDT App — Material Master Module
> **Document analyzed:** `document/คู่มือการจัดการวัสดุ - การบริหารฐานข้อมูลวัสดุ BDT Engineer 7.doc`
> **As-is repo:** `bdt-app/` (React 19 + TypeScript 6 + Vite 8, mock data only)
> **Architecture:** 🟢 **Monolith — 1 repo, FE + BE อยู่ด้วยกัน**
> **Target stack:** Frontend (React/Vite — ของเดิม) + Backend (NestJS 10 + PostgreSQL 16 — เพิ่มเป็น `backend/` folder ใน repo เดียวกัน)
> **Sprint length:** 1 สัปดาห์ (5 working days)
> **Date:** 27 เม.ย. 2026
> **Companion docs:**
> - [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) — ADR: Standard / Hybrid / Custom (ยังใช้)
> - [`MICROSERVICES_PLAN.md`](./MICROSERVICES_PLAN.md) — 🟡 **DEFERRED** — future reference เท่านั้น ทีมเลือก monolith ก่อน
>
> **🟦 Architecture Principles:**
> 1. **Monolith first** — โค้ดทั้ง FE + BE อยู่ใน `bdt-app/` repo เดียว, deploy ง่าย, ไม่มี broker / inter-service overhead
> 2. **Odoo-compatible schema** — ลอกตาม Odoo convention ให้มากที่สุด (≈60%) เพื่อ migrate ไป Odoo จริงได้ 1:1 ในอนาคต — Custom เฉพาะกฎคู่มือ BDT ที่ Odoo ไม่ตอบ
> 3. **Modular monolith** — ใน NestJS แบ่ง module ตาม bounded context (materials, master-data, identity, mail) — ถ้าวันหน้าต้องแยก microservices (ดู MICROSERVICES_PLAN) จะ strangle ออกได้ทีละ module

---

## 1. สรุปการวิเคราะห์เอกสารคู่มือ (Document Analysis)

### 1.1 วัตถุประสงค์ของระบบ (จากเอกสาร)
- จัดเก็บข้อมูลผลิตภัณฑ์อย่างเป็นระบบ
- สนับสนุนการขายและการผลิต
- ลดความซ้ำซ้อนและข้อผิดพลาดของข้อมูล
- ทำให้การเชื่อมต่อกับระบบอื่น (ERP, BIM, Dashboard) ราบรื่น

### 1.2 ขอบเขตวัสดุ (Scope)
ครอบคลุม 4 กลุ่มหลัก
1. เหล็กโครงสร้างหลัก — Plate, Hot Roll Shape, Steel Structures
2. เหล็กโครงสร้างรอง — Coldform Shape
3. วัสดุเหล็กส่วนประกอบอื่น — Steel Accessories, Building Components
4. วัสดุสิ้นเปลือง — Consumable

### 1.3 Use Cases หลัก 2 อย่าง
1. **ขอรหัสวัสดุใหม่ (New Material Registration)** — กรอก 5 หลักแรกตามกลุ่ม, run number 5 หลักหลังโดยคลังวัสดุ
2. **ขอปรับปรุงฐานข้อมูลวัสดุเดิม (Update Existing Material)** — ระบุรหัสเดิมเพื่ออัปเดต
3. กรณีพิเศษ — **Substitute Part** ใส่รหัส 10 หลัก ที่เปลี่ยนเฉพาะหลักที่ 4

### 1.4 โครงสร้าง Part Code (10 หลัก)
```
[ X ][ X ][ X ][ X ][ X ][ R ][ R ][ R ][ R ][ R ]
└─── 5 หลักแรก = กลุ่ม ───┘└─── 5 หลัก Run Number ─┘
                              (ออกโดยคลังวัสดุ)
```
- 13 กลุ่มหลัก ตามตารางคู่มือ (เห็นในเอกสารชัด 7 กลุ่มแรก พร้อม subgroup และรหัสบัญชี)
- หลักที่ 4 ใช้สำหรับ Substitute Part (เทียบแทน)

### 1.5 Required Fields ของ Material Master
| Field | คำอธิบาย | กฎ |
|---|---|---|
| `Part Code` | รหัสวัสดุ 10 หลัก | 5 หลักแรกตามกลุ่ม / 5 run / หลัก 4 = substitute flag |
| `Description` | ชื่อวัสดุภาษาอังกฤษพิมพ์ใหญ่ | 2 ส่วน: ชื่อหลัก + Spec/H/B/TW/TF/T/D/C |
| `Unit (UoM)` | หน่วยนับสากล | 20 หน่วยมาตรฐาน BDT (Each, Set, Pieces, Metres, Roll, Kilograms, Box, Bottle, Drum, Can, Book, Gallon, Pail, Pack, Litre, Pair, Centimetres, Sheet, Feet, Cylinder) |
| `Group` | กลุ่มวัสดุ 13 กลุ่ม | จาก master table; Spare Part / Fixed Asset ต้องระบุ Criticality |
| `Product Attributes` | Class — grade, ขนาด, ความหนา, น้ำหนัก | เช่น SS400, SM520 + dimensions |

### 1.6 ขั้นตอนนำข้อมูลเข้าระบบ (เอกสารหัวข้อ 2 + 3)
ผู้ใช้กรอก Requirement Form → ส่งให้ทีมตรวจสอบ → ทีมตรวจ 4 ข้อ
1. ตรวจ Part ซ้ำ และ Common Part
2. ตรวจ Description & Unit ถูกต้องสมบูรณ์
3. ตรวจ Product Group
4. ตรวจ Product Attributes

อนุมัติ → คลังวัสดุ run 5 หลักหลัง → Active

### 1.7 Group/Subgroup Mapping (จากตารางในเอกสาร)
| กลุ่ม | ชื่อกลุ่มหลัก | จำนวน Subgroup | ตัวอย่าง Subgroup + รหัสบัญชี |
|---|---|---|---|
| 1 | พนักงานและกิจกรรมต่างๆ | 5 | 1.1 Employee Recreation (61311), 1.2 Advertising (69101), 1.3 Personnel activity (61310), 1.4 Other Non-Fringe Benefits (61249), 1.5 Uniform (61235) |
| 2 | เครื่องมือและอุปกรณ์โรงงาน | 1 | 2.1 Plant Machine, Equipment, Tools (62411) |
| 3 | อุปกรณ์สำนักงาน | 1 | 3.1 Office Equipment, Furniture & Fixture (62412) |
| 4 | ยาและอุปกรณ์ทางการแพทย์ | 1 | 4.1 Medical & Tools (61234) |
| 5 | วัสดุสิ้นเปลืองสำนักงาน | 6 | 5.1 Printing & Stationary (62401), 5.2 Photocopies & Fax (62402), 5.3 Computer Supplies (62403), 5.4 Janitorial (62404), 5.5 Other Office (62409), 5.6 Gardening (67206) |
| 6 | อุปกรณ์ซ่อมแซมอาคาร | 1 | 6.1 Office Building Maintenance (56130) |
| 7 | วัสดุและอุปกรณ์ความปลอดภัย | 1 | 7.1 Safety Supplies (62405) |
| 8 | Stationary | (ระบุในข้อ 8) | (รายละเอียดถูกตัดในเอกสารต้นฉบับ — ต้องสอบถามเพิ่ม) |
| 9–13 | กลุ่มเหล็ก (Plate, HR Shape, Coldform, Pipe, Coil, Building Component, Bolt/Nut, Weld Consumable, Paint, etc.) | — | ระบุไว้ในขอบเขต — ต้องเพิ่มในระบบเพื่อให้ครบ 13 กลุ่ม |

> ⚠️ **Note:** ตารางในเอกสารแสดงเพียง 7 กลุ่มแรก กลุ่ม 8–13 ในเอกสารนี้ไม่ครบ — ทีมต้องยืนยันรายละเอียดก่อนเริ่ม Sprint

---

## 2. การวิเคราะห์ As-is Codebase

### 2.1 Tech Stack ปัจจุบัน
- **Frontend only**: React 19, TypeScript 6, Vite 8, Tailwind 4, React Router 7
- **State**: Zustand (`src/store/routingStore.ts` — มีเฉพาะ routing)
- **Data**: ทั้งหมดเป็น mock ใน `src/data/*` ไม่มี backend, ไม่มี API client
- **Auth**: ยังไม่มี

### 2.2 โครงสร้าง src/
```
src/
├── App.tsx                    # routes
├── components/
│   ├── layout/                # AppShell, Sidebar, Topbar
│   └── ui/                    # CatBadge, OpBadge, ProductStatusPill, StatusPill, StepDots
├── data/
│   ├── meta.ts                # OP_META, CAT_META, MAT_GROUP_META (13 groups), STATUS_META
│   ├── mock.ts                # mock routings
│   ├── mockBom.ts             # mock BOM
│   ├── mockProducts.ts        # mock 14 products (ครอบคลุม 6 categories × หลาย MaterialGroup)
│   └── utils.ts
├── pages/
│   ├── ProductList.tsx        # ✅ list + filter + sort + select + paginate
│   ├── ProductDetail.tsx      # ✅ tabs: ภาพรวม/Routing/BOM/Versions/ประวัติ + submit modal
│   ├── BomEditor.tsx
│   ├── BomDiffReview.tsx
│   ├── RoutingEditor.tsx
│   └── RoutingList.tsx
├── store/routingStore.ts      # Zustand — เฉพาะ Routing
└── types/index.ts             # Product, ProductAttributes, MaterialGroup, etc.
```

### 2.3 Domain Model ใน TypeScript (ตรงกับเอกสารระดับสูง)
- ✅ **`Product`** — มี `product_code`, `name_th`, `name_en`, `category`, `material_group`, `status`, `version`, `uom`, `odoo_ref_id`, `substitute_for`, `attributes`, `spec`, `updated_at`, `updated_by`
- ✅ **`MaterialGroup`** — 13 ค่า (PLATE, HR_SHAPE, COLDFORM, PIPE_TUBE, FLAT_ROUND_BAR, COIL, BOLT_NUT, WELD_CONSUMABLE, PAINT_COAT, BUILDING_COMP, ACCESSORY, SPARE_PART, FIXED_ASSET) — สอดคล้องเอกสาร
- ✅ **`ProductAttributes`** — `grade`, `height_h`, `width_b`, `web_tw`, `flange_tf`, `thickness_t`, `diameter_d`, `lip_c`, `length_mm`, `width_mm`, `weight_per_m` — ตรงกับ H/B/TW/TF/T/D/C ในเอกสาร
- ✅ **`ProductStatus`** — Draft, PendingReview, Active, Rejected, Blocked — รองรับ workflow

### 2.4 ฟีเจอร์ที่มีใน UI แล้ว
- รายการชิ้นงาน (search, filter category/status, sort, paginate, bulk select)
- หน้ารายละเอียด พร้อม tabs (ภาพรวม, Routing, BOM, Versions, ประวัติ)
- Modal "ส่งให้ตรวจสอบ" (ยังไม่ persist)
- Material Group meta พร้อม icon + สี ครบ 13 กลุ่ม

---

## 3. Gap Analysis: As-is vs เอกสารคู่มือ

| # | Requirement จากคู่มือ | สถานะปัจจุบัน | Gap | Priority |
|---|---|---|---|---|
| G1 | Material Master Data Persistence | mock in-memory ใน `mockProducts.ts` | ไม่มี DB / ไม่มี API | 🔴 Critical |
| G2 | Material Registration Form (ขอรหัสใหม่) | ปุ่ม "เพิ่มชิ้นงาน" ยังไม่ทำงาน | ขาด form + submit handler | 🔴 Critical |
| G3 | Part Code Generator (10 digits) | ไม่มี logic | ต้อง generate 5-digit prefix จาก group + run 5 หลักโดยคลังวัสดุ | 🔴 Critical |
| G4 | Update Existing Material flow | กดแก้ไขได้ใน UI แต่ไม่ persist | ต้องมี API + version increment | 🔴 Critical |
| G5 | Substitute Part (10 หลัก, เปลี่ยนหลัก 4) | type มี field `substitute_for` แต่ไม่มี UI/logic | ต้องสร้าง flow + validation | 🟡 High |
| G6 | Duplicate / Common Part Detection | ไม่มี | ต้อง search ตาม attributes/grade/spec ก่อนอนุมัติ | 🟡 High |
| G7 | Description Format Validator (UPPERCASE EN, 2 ส่วน) | ไม่มี | ต้อง regex/validator ทั้ง FE+BE | 🟡 High |
| G8 | UoM Master (20 standard units) | ใส่ตรงๆ string | ต้องมี master table + dropdown | 🟢 Medium |
| G9 | Group + Subgroup + รหัสบัญชี | meta มี 13 groups แต่ไม่มี subgroup + account code | ต้องเพิ่ม subgroup table (~16 รายการ) | 🟡 High |
| G10 | Spare Part / Fixed Asset Criticality | ไม่มี | ต้องเพิ่ม field + rule | 🟢 Medium |
| G11 | Workflow & Approval (ผู้ขอ → ทีมตรวจ → คลัง run number → Active) | UI mock; ไม่ persist | ต้อง state machine + RBAC | 🟡 High |
| G12 | Auth + RBAC (Requestor, Reviewer, Warehouse) | ไม่มี | ต้อง JWT + role | 🟡 High |
| G13 | Audit Log (who/when/what changed) | mock เท่านั้น | ต้อง trail table | 🟢 Medium |
| G14 | Odoo Integration (`odoo_ref_id` sync) | field มีแต่ไม่ได้ sync | ทำใน sprint หลัง — Sprint นี้ stub ไว้ก่อน | 🔵 Low |
| G15 | NestJS + Postgres backend | ยังไม่มี | สร้างใหม่จาก scratch | 🔴 Critical |

---

## 4. Sprint Goal

> **"ผู้ใช้สามารถ Register วัสดุใหม่ผ่าน UI ได้ เก็บข้อมูลใน PostgreSQL ผ่าน NestJS API (monolith เดียว) ที่ใช้ Odoo-compatible schema พร้อม validation ตามกฎคู่มือ BDT และส่งเข้าสถานะ `to_approve` เพื่อรออนุมัติ"**

**Definition of Done (Sprint-level)**
- ✅ Monolith repo `bdt-app/` มี 2 ส่วน:
  - `frontend/` (หรือคง root + `src/` เดิม) — React app เดิม
  - `backend/` — NestJS app ใหม่
- ✅ Root `docker-compose.yml` รัน `frontend`, `backend`, `postgres` ใน `docker compose up` คำสั่งเดียว
- ✅ Backend boot ได้, เชื่อม Postgres ผ่าน Prisma migration
- ✅ Schema ใช้ Odoo naming (`default_code`, `categ_id`, `uom_id`, `state`, `active`, `create_uid`, `write_uid`) — ตามที่ระบุใน ADR §2.1
- ✅ Master data seed: `uom_uom` (20 หน่วย), `product_category` (7 กลุ่มที่ยืนยัน + `prefix_5`), `account_account`, `res_users` (1 admin user)
- ✅ Endpoint `POST /api/v1/materials` รับ payload + validate ตามกฎคู่มือ → save → return 201
- ✅ Endpoint `GET /api/v1/materials` + `GET /api/v1/materials/:default_code` พร้อม pagination
- ✅ Endpoint `PATCH /api/v1/materials/:default_code` สำหรับ "ขอปรับปรุงฐานข้อมูลวัสดุ"
- ✅ Endpoint `POST /api/v1/materials/:default_code/action_submit` เปลี่ยน state → `to_approve`
- ✅ State machine: `draft → to_approve → confirmed → cancel` (UI alias: Draft / PendingReview / Active / Rejected)
- ✅ Audit log: เขียนลง `mail_message` table ทุกครั้งที่ create/update/state-change (in-process service call ตรง — ไม่มี event bus ใน Sprint นี้)
- ✅ Custom logic ที่ทำเสร็จ: Part Code Generator, Description Validator, Attributes-by-group JSON Schema, Duplicate Detector
- ✅ Frontend: ปุ่ม "เพิ่มชิ้นงาน" เปิด form, submit ไป API จริง
- ✅ Frontend: `ProductList` ดึงข้อมูลจริงจาก backend (แทน mock)
- ✅ Frontend dev proxy: Vite `/api` → `http://localhost:3000` (NestJS) — production: nginx serve frontend + reverse-proxy `/api` → backend
- ✅ Unit test backend ≥70% coverage, E2E test happy path 1 case (Supertest)
- ✅ README อัปเดต + ADR link

**Out of scope (Sprint นี้):**
- Workflow approval ฝั่ง Reviewer (mock ไปก่อน — Sprint หน้าทำต่อ)
- Auth/JWT จริง (ใช้ header `x-user-id` mock — schema เผื่อ `res_users` ไว้แล้ว)
- Odoo integration จริง (เก็บ field `odoo_ref_id` nullable ไว้รอ sync)
- Substitute Part flow (Sprint หน้า)
- ECO module / `mrp.eco` pattern สำหรับ versioning (Sprint หน้า)
- Subgroup เต็มทุก 13 กลุ่ม + Criticality A/B/C — Sprint นี้ทำเฉพาะ 7 กลุ่มแรกที่เอกสารยืนยัน
- **Microservices / Event bus / RabbitMQ / Multi-repo** — ดู `MICROSERVICES_PLAN.md` (deferred)

---

## 5. Backlog & User Stories

> **Tag legend:** 🟦 Standard (Odoo-style)  ·  🟨 Hybrid (Odoo + extend)  ·  🟥 Custom (BDT-only)
>
> **Scope:** monolith — 1 repo, 1 backend process, 1 Postgres DB, no broker

### Epic A — Backend Setup (NestJS + Postgres)

| ID | Tag | Story | Estimate | DoD |
|---|:-:|---|---|---|
| **A1** | 🟦 | As DevOps, สร้างโครง `backend/` ใน repo เดียวกับ frontend + scaffold NestJS + Prisma + Postgres ผ่าน root `docker-compose.yml` | 4 h | `docker compose up` รัน frontend + backend + postgres พร้อมกัน, `/api/v1/healthz` 200 |
| **A2** | 🟦 | As BE Dev, schema **Odoo-compatible** ใน 1 database `bdt`: `res_users`, `uom_category`, `uom_uom`, `account_account`, `product_category`, `materials`, `part_code_seq`, `mail_message` | 4 h | Prisma migration apply สำเร็จ; seed: 1 admin user + 20 UoM + 7 categories (พร้อม `prefix_5`+`account_id`) |
| **A3** | 🟦 | As BE Dev, `MaterialsModule` + `MasterDataModule` + `MailModule` ใน NestJS (modular monolith) — ทุก module export service ให้กันเรียกได้ | 3 h | `pnpm test` pass; `MaterialsService` ฉีด `MailService` ได้ |
| **A4** | 🟨 | As Architect, เพิ่ม `odoo_ref_id` (nullable + unique partial index) ใน `materials`, `product_category`, `uom_uom`, `res_users` เผื่อ sync อนาคต | 1 h | column ครบ + migration |

### Epic B — Material Registration API

| ID | Tag | Story | Estimate | DoD |
|---|:-:|---|---|---|
| **B1** | 🟦 | As Requestor, ผมต้องการ `POST /materials` เพื่อขอรหัสใหม่ (state=`draft`) | 4 h | DTO validation + insert + 201 พร้อม resource |
| **B2** | 🟥 | As Requestor, ผมต้องการ **Part Code Generator** (BDT-specific): 5-digit group prefix + temp 5-digit pending — กฎจากคู่มือ §1.1.1 | 3 h | unit test ≥5 cases (new material, substitute, edge cases) |
| **B3** | 🟦 | As Requestor, ผมต้องการ `PATCH /materials/:default_code` เพื่อขอปรับปรุงข้อมูล + auto increment `version` (Odoo write pattern) | 3 h | optimistic lock (`write_date`) ป้องกัน race + tracking diff ใน `mail_message` |
| **B4** | 🟦 | As Reviewer, ผมต้องการ `POST /materials/:default_code/action_submit` (Odoo `action_*` convention) เปลี่ยน state → `to_approve` | 1 h | state machine ปฏิเสธถ้า state != `draft` |
| **B5** | 🟦 | As Reviewer, ผมต้องการ `GET /materials?state=&categ_id=&q=&page=&limit=` พร้อม pagination | 2 h | unit test 3 filter combos |

### Epic C — Validation Rules (ตามคู่มือข้อ 3)

| ID | Tag | Story | Estimate | DoD |
|---|:-:|---|---|---|
| **C1** | 🟥 | Validate Description: UPPERCASE EN, ห้ามไทย, 2 ส่วน (ชื่อหลัก + Spec/H/B/TW/TF/T/D/C) — ADR §3.3 | 2 h | regex + 8 unit tests |
| **C2** | 🟦 | Validate UoM: FK → `uom_uom` (20 มาตรฐาน) | 1 h | FK check |
| **C3** | 🟦 | Validate Category: FK → `product_category` (13 master groups) | 1 h | FK check |
| **C4** | 🟥 | **Detect Duplicate / Common Part** (BDT custom): ค้นหา product เดิม `categ_id + attributes.grade + dimensions ภายใน tolerance ±5%` → return list candidates (warning, ไม่ block) — ADR §3.5 | 4 h | E2E test: insert 2 ตัวคล้ายกัน → ตัวที่ 2 ได้ `duplicates: [...]` |
| **C5** | 🟨 | Validate Product Attributes ตาม group ผ่าน **JSON Schema per group** (HR_SHAPE→H/B/TW/TF, PLATE→T/W/L) — ADR §3.4 | 3 h | per-group schema (Zod), 13 groups × test 1 case |

### Epic D — Frontend Wiring

| ID | Tag | Story | Estimate | DoD |
|---|:-:|---|---|---|
| **D1** | 🟦 | สร้าง API client (axios + react-query) ใน `src/api/materials.ts` ใช้ Odoo field naming | 2 h | typed wrapper สำหรับ 5 endpoints (`default_code`, `categ_id`, `uom_id`, `state`) |
| **D2** | 🟦 | แทนที่ `mockProducts` ใน `ProductList.tsx` ด้วย `useQuery(['materials'])` + skeleton loading + map state→UI label (Draft/PendingReview/...) | 3 h | list ใช้ API จริง, error/empty state ครบ |
| **D3** | 🟨 | สร้างหน้า/Modal "เพิ่มชิ้นงาน" — เลือก group → form attributes แสดงตาม JSON Schema (dynamic), description, UoM dropdown, แสดง 5-digit prefix preview | 6 h | form ตรง spec, react-hook-form + zod, submit ไป `POST /materials`, แสดง duplicate warning |
| **D4** | 🟦 | ปุ่ม "ส่งให้ตรวจสอบ" ใน `ProductDetail` ยิง `POST /materials/:default_code/action_submit` จริง | 2 h | toast success/error + invalidate query |

### Epic E — Quality & Docs

| ID | Tag | Story | Estimate | DoD |
|---|:-:|---|---|---|
| **E1** | 🟦 | Unit tests BE (Jest) — coverage ≥70% สำหรับ MaterialsService + Validators | 3 h | CI pass |
| **E2** | 🟦 | E2E test (supertest) — happy path: register → list → action_submit | 2 h | green |
| **E3** | 🟦 | OpenAPI/Swagger UI ที่ `/api/docs` | 1 h | endpoint ครบ + ตัวอย่างที่ใช้ Odoo field naming |
| **E4** | 🟦 | อัปเดต `README.md` + `CHANGELOG.md` + link ไป ADR | 1 h | doc reviewed |

**รวม estimate:** ≈ 56 h → 5 dev days × 2 dev = 80 h capacity (buffer ~30%)
**สัดส่วน:** 🟦 Standard ~64% · 🟨 Hybrid ~14% · 🟥 Custom ~22% — ตรงเป้าสถาปัตยกรรมที่ระบุใน ADR (60/10/30)
**Note:** ตัวเลขนี้ลดลงจากแผน microservices (~70h) เพราะตัด overhead 8 repos / event bus / shared lib publishing ออก

---

## 6. Sprint Schedule (5 working days, 2 devs)

| Day | Focus | Dev A (BE-heavy) | Dev B (FE + integration) |
|---|---|---|---|
| **จันทร์** (D1) | Setup + Schema | **A1** scaffold backend + docker-compose, **A2** Prisma schema + migration + seed | refactor `bdt-app` (root → `frontend/`?) — หรือคง root, ตั้ง `backend/`; review schema เผื่อ FE |
| **อังคาร** (D2) | Core API | **A3** modules + DI, **B1** POST, **B2** Part Code Generator, **B5** GET list | **D1** API client (axios) + react-query setup, types alignment |
| **พุธ** (D3) | Validation + Update | **C1** Description, **C2/C3** UoM/Category FK, **B3** PATCH | **D2** ProductList → API จริง + skeleton/error |
| **พฤหัส** (D4) | Duplicate + Form | **C4** Duplicate Detector, **C5** Attributes JSON Schema | **D3** Material Register Form (dynamic per category) |
| **ศุกร์** (D5) | Submit + Tests + Demo | **B4** action_submit + audit log, **E1** unit tests, **E2** E2E | **D4** Submit button wiring + **E3/E4** docs + Demo prep |

**Daily ceremonies:**
- 09:30 Daily Standup (15 min)
- 17:00 Async written update ใน Slack/Notion

**End of Sprint:**
- ศุกร์ 14:00 Sprint Review + Demo
- ศุกร์ 15:00 Retrospective

---

## 7. Technical Design Snapshot

### 7.1 PostgreSQL Schema (Odoo-compatible)

> **Naming policy:** ทุก column ใช้ Odoo convention — `default_code`, `categ_id`, `uom_id`, `state`, `active`, `create_uid/_date`, `write_uid/_date`.
> Cherry-pick เฉพาะ field ที่จำเป็นต่อ Sprint นี้ (ไม่ดึงทุก field ของ Odoo เข้ามา)

```sql
-- ── 🟦 Standard Odoo: res_users (stub สำหรับ create_uid / write_uid) ─────
CREATE TABLE res_users (
  id          SERIAL PRIMARY KEY,
  login       VARCHAR(60) UNIQUE NOT NULL,
  name        VARCHAR(120) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── 🟦 Standard Odoo: uom_category + uom_uom (20 หน่วยจากคู่มือ) ────────
CREATE TABLE uom_category (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(40) NOT NULL                    -- 'Quantity', 'Length', 'Mass', 'Volume'
);

CREATE TABLE uom_uom (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(40) NOT NULL,                   -- 'Each', 'Kilograms', 'Metres', ...
  category_id INT NOT NULL REFERENCES uom_category(id),
  factor      NUMERIC(12,6) NOT NULL DEFAULT 1,
  uom_type    VARCHAR(10) NOT NULL DEFAULT 'reference', -- 'reference' | 'bigger' | 'smaller'
  rounding    NUMERIC(12,6) NOT NULL DEFAULT 0.01,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  odoo_ref_id VARCHAR(40)                             -- 🟨 reserved for future Odoo sync
);

-- ── 🟦 Standard Odoo: account_account (รหัสบัญชี 61311 ฯลฯ) ─────────────
CREATE TABLE account_account (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(10) UNIQUE NOT NULL,            -- '61311', '69101', '62411'
  name        VARCHAR(120) NOT NULL,
  account_type VARCHAR(40) NOT NULL,                  -- 'expense' | 'asset'
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── 🟨 Hybrid (Odoo tree + BDT extension): product_category ─────────────
CREATE TABLE product_category (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(80) NOT NULL,               -- ภาษาไทย/อังกฤษตามต้นฉบับเอกสาร
  parent_id       INT REFERENCES product_category(id) ON DELETE RESTRICT,
  complete_name   VARCHAR(200),                       -- auto: '1 / 1.1 Employee Recreation'
  -- 🟥 BDT extension fields ↓
  group_no        VARCHAR(10),                        -- '1', '1.1', '5.6'
  prefix_5        CHAR(5) UNIQUE,                     -- 5-digit prefix สำหรับ default_code
  account_id      INT REFERENCES account_account(id),
  needs_criticality BOOLEAN NOT NULL DEFAULT FALSE,   -- true สำหรับ Spare Part / Fixed Asset
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  odoo_ref_id     VARCHAR(40)
);
CREATE INDEX idx_prodcat_parent ON product_category(parent_id);

-- ── 🟦/🟨/🟥 Mixed: materials (เลียน product.template + custom fields) ──
CREATE TABLE materials (
  id                SERIAL PRIMARY KEY,
  -- 🟥 Custom: BDT 10-digit Part Code (Odoo มี default_code free string — เรา constrain)
  default_code      CHAR(10) UNIQUE NOT NULL,
  name              VARCHAR(200) NOT NULL,            -- 🟦 Odoo: ใช้ name (TH หรือ EN ตาม locale)
  description_sale  VARCHAR(200) NOT NULL,            -- 🟦 Odoo: description ภาษาอังกฤษพิมพ์ใหญ่ (validate format)
  -- 🟦 Odoo m2o references
  categ_id          INT NOT NULL REFERENCES product_category(id),
  uom_id            INT NOT NULL REFERENCES uom_uom(id),
  uom_po_id         INT REFERENCES uom_uom(id),       -- 🟦 Odoo: หน่วยซื้อ (default = uom_id)
  type              VARCHAR(20) NOT NULL DEFAULT 'product', -- 🟦 Odoo: 'product'|'consu'|'service'
  -- 🟦 Odoo standard state machine
  state             VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft|to_approve|confirmed|cancel|blocked
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  -- 🟦 Odoo versioning + 🟥 BDT custom
  version           VARCHAR(10),                      -- '1.0.0' (semver) — Sprint หน้าจะใช้ mrp.eco
  substitute_for    INT REFERENCES materials(id),     -- 🟥 Custom — Sprint หน้า
  substitute_seq    SMALLINT,                         -- 🟥 Custom: หลักที่ 4 (1–9)
  -- 🟨 Hybrid: BDT priority/criticality
  priority          CHAR(1),                          -- '0'..'3' (Odoo)
  criticality       VARCHAR(2),                       -- 'A'|'B'|'C' (BDT)
  -- 🟨 Engineering attributes (flexible per group, validated by JSON Schema)
  attributes        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {grade, height_h, width_b, web_tw, flange_tf, thickness_t, diameter_d, lip_c, length_mm, width_mm, weight_per_m}
  -- 🟥 BDT-specific
  drawing_ref       VARCHAR(60),
  bim_object_id     VARCHAR(80),
  total_weight_kg   NUMERIC(12,3),
  -- 🟨 reserved for Odoo sync
  odoo_ref_id       VARCHAR(40),
  -- 🟦 Odoo standard audit fields
  create_uid        INT NOT NULL REFERENCES res_users(id),
  create_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  write_uid         INT NOT NULL REFERENCES res_users(id),
  write_date        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_materials_categ    ON materials(categ_id);
CREATE INDEX idx_materials_state    ON materials(state) WHERE active;
CREATE INDEX idx_materials_attr_gin ON materials USING GIN (attributes);
CREATE INDEX idx_materials_substitute ON materials(substitute_for) WHERE substitute_for IS NOT NULL;

-- ── 🟥 Custom: counter table for Part Code Generator (concurrency-safe) ──
CREATE TABLE part_code_seq (
  prefix_5    CHAR(5) PRIMARY KEY,
  next_run    INT NOT NULL DEFAULT 1
);
-- ใช้ SELECT ... FOR UPDATE ใน transaction → ป้องกัน race condition

-- ── 🟦 Standard Odoo: mail.message pattern (audit log) ──────────────────
CREATE TABLE mail_message (
  id            BIGSERIAL PRIMARY KEY,
  model         VARCHAR(60) NOT NULL,                 -- 'material'
  res_id        INT NOT NULL,                         -- materials.id
  message_type  VARCHAR(20) NOT NULL,                 -- 'notification'|'comment'|'audit'
  subject       VARCHAR(200),
  body          TEXT,
  tracking      JSONB,                                -- [{field, old_value, new_value}]
  author_id     INT REFERENCES res_users(id),
  date          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mail_message_res ON mail_message(model, res_id);
```

#### Mapping ตาราง: BDT TypeScript ↔ Odoo schema

| `src/types/index.ts` (frontend) | DB column (Odoo-compat) | Tag |
|---|---|---|
| `Product.product_code` | `materials.default_code` | 🟥 Custom format |
| `Product.name_th` | `materials.name` | 🟦 |
| `Product.name_en` | `materials.description_sale` | 🟦 |
| `Product.material_group` | `materials.categ_id` (→ `product_category`) | 🟦 |
| `Product.uom` | `materials.uom_id` (→ `uom_uom`) | 🟦 |
| `Product.status` | `materials.state` (`draft`/`to_approve`/`confirmed`/`cancel`/`blocked`) | 🟦 |
| `Product.attributes` | `materials.attributes` (JSONB) | 🟨 |
| `Product.substitute_for` | `materials.substitute_for` (→ self) | 🟥 |
| `Product.spec.drawing_ref` | `materials.drawing_ref` | 🟥 |
| `Product.spec.total_weight_kg` | `materials.total_weight_kg` | 🟥 |
| `Product.odoo_ref_id` | `materials.odoo_ref_id` | 🟨 |
| `Product.updated_at`, `updated_by` | `materials.write_date`, `write_uid` | 🟦 |

### 7.2 Repo Layout (Monolith — 1 repo, FE + BE)

```
bdt-app/                                     ← repo root (Git repo เดียว)
├── README.md
├── docker-compose.yml                       # frontend + backend + postgres
├── .env.example
│
├── frontend/                                # (เลือกแนวที่ทีมสะดวก ดู §7.2.1)
│   ├── src/                                 # React 19 + Vite — ของเดิม
│   ├── package.json
│   ├── vite.config.ts                       # proxy /api → backend:3000
│   └── Dockerfile.dev
│
├── backend/                                 # NestJS monolith (ใหม่)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/                          # env + zod validation
│   │   ├── common/                          # filters, pipes, interceptors, guards
│   │   ├── prisma/
│   │   │   ├── schema.prisma                # 🟦 Odoo column names
│   │   │   └── seed.ts                      # 7 groups + 20 uoms + accounts + admin user
│   │   ├── modules/                         # ← modular monolith (เผื่อแยก service ในอนาคต)
│   │   │   ├── identity/                    # 🟦 stub Odoo res.users
│   │   │   │   ├── identity.module.ts
│   │   │   │   └── identity.service.ts      # decode x-user-id header
│   │   │   ├── master-data/                 # 🟨 uom + product_category + account
│   │   │   │   ├── master-data.module.ts
│   │   │   │   ├── uoms.controller.ts       # GET /uoms
│   │   │   │   ├── product-categories.controller.ts # GET /product-categories
│   │   │   │   └── master-data.service.ts
│   │   │   ├── materials/                   # 🟦/🟨/🟥 mixed (core domain)
│   │   │   │   ├── dto/
│   │   │   │   │   ├── create-material.dto.ts
│   │   │   │   │   ├── update-material.dto.ts
│   │   │   │   │   └── query-material.dto.ts
│   │   │   │   ├── validators/
│   │   │   │   │   ├── description.validator.ts        # 🟥 UPPERCASE EN + 2 parts
│   │   │   │   │   ├── attributes-by-group.schemas.ts  # 🟨 JSON Schema per categ
│   │   │   │   │   ├── attributes.validator.ts
│   │   │   │   │   └── duplicate-detector.service.ts   # 🟥 BDT
│   │   │   │   ├── part-code.generator.ts              # 🟥 10-digit
│   │   │   │   ├── materials.state-machine.ts          # 🟦 state transitions
│   │   │   │   ├── materials.controller.ts
│   │   │   │   ├── materials.service.ts                # ฉีด MailService ตรงๆ
│   │   │   │   └── materials.module.ts
│   │   │   └── mail/                        # 🟦 mail.message pattern (in-process)
│   │   │       ├── mail-message.service.ts  # log()/track() เรียกจาก materials.service
│   │   │       └── mail.module.ts
│   │   └── health/health.controller.ts      # /api/v1/healthz, /readyz
│   ├── test/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── Dockerfile
│   └── .env.example
│
├── nginx/                                   # production reverse proxy (optional Sprint 1)
│   └── default.conf                         # / → frontend, /api → backend
│
└── docs/
    ├── api.md                               # endpoint reference
    └── adr/                                 # link STANDARDIZE_VS_CUSTOM_ODOO + อื่นๆ
```

#### 7.2.1 ตัวเลือกการจัด root layout (Dev เลือก 1 อันใน D1)

| Option | โครงสร้าง | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **A. Subfolders ธรรมดา (Recommended)** | คง `src/` (frontend) ที่ root + เพิ่ม `backend/` เป็น sibling | ไม่ต้องรื้อ frontend, scripts เดิมทำงานต่อ | root `package.json` เป็นของ FE — `cd backend && pnpm i` แยก |
| **B. ย้ายเป็น apps/** | สร้าง `apps/web/` (ย้าย FE มา) + `apps/api/` (BE ใหม่) + pnpm workspace | สมมาตร, root scripts รัน FE+BE พร้อมกันได้ | ต้องรื้อ Vite config, import paths ทั้งหมด |
| **C. Backend ใน `server/`** | คง root เดิม + `server/` (NestJS) | คล้าย Option A แต่ใช้ชื่อ "server" | เหมือน A |

**คำแนะนำ:** Sprint 1 ใช้ **Option A** — ความเสี่ยงน้อยสุด, รื้อ Vite config 0 บรรทัด

### 7.3 Key API Contracts (Odoo-flavored REST)

```http
# ── สร้างวัสดุใหม่ (state=draft) ──
POST /api/v1/materials
Headers: x-user-id: 5
Body: {
  "categ_id": 9,                              # 🟦 FK → product_category (HR_SHAPE)
  "uom_id": 6,                                # 🟦 FK → uom_uom (Kilograms)
  "name": "เหล็ก H-Beam SS400 H300×B150×TW6.5×TF9",
  "description_sale": "H-BEAM SS400 H=300 B=150 TW=6.5 TF=9",   # 🟥 validated
  "type": "product",
  "attributes": {                             # 🟨 validated by JSON Schema ของ HR_SHAPE
    "grade": "SS400", "height_h": 300, "width_b": 150, "web_tw": 6.5, "flange_tf": 9
  },
  "drawing_ref": "DWG-HS-300"                 # 🟥 optional
}
→ 201 {
  "id": 142,
  "default_code": "HRS01-PEND",               # 🟥 5-digit prefix + 'PEND' (รอคลังวัสดุ run)
  "state": "draft",
  "duplicates": [                             # 🟥 warning, ไม่ block
    { "id": 88, "default_code": "HRS0100012", "name": "...", "match_score": 0.92 }
  ],
  "create_uid": 5, "create_date": "2026-04-28T03:21:00Z",
  ...
}

# ── ขอปรับปรุงฐานข้อมูลวัสดุ (Odoo write pattern) ──
PATCH /api/v1/materials/:default_code
Body: { "description_sale": "...", "attributes": { ... } }
→ 200 (พร้อม mail_message tracking diff)

# ── State transitions (Odoo action_* convention) ──
POST /api/v1/materials/:default_code/action_submit         # draft → to_approve
POST /api/v1/materials/:default_code/action_confirm        # to_approve → confirmed (Sprint 2)
POST /api/v1/materials/:default_code/action_cancel         # → cancel
POST /api/v1/materials/:default_code/action_assign_runno   # 🟥 คลังวัสดุ assign 5 หลักหลัง

# ── Search/Read ──
GET  /api/v1/materials?state=draft&categ_id=9&q=H-BEAM&page=1&limit=20
GET  /api/v1/materials/:default_code
GET  /api/v1/materials/:default_code/messages              # 🟦 mail.message thread (audit)

# ── Master ──
GET  /api/v1/uoms
GET  /api/v1/product-categories                            # tree response
GET  /api/v1/users/me                                      # 🟦 from x-user-id stub
GET  /api/v1/healthz                                       # liveness
```

**Note:** ทุก endpoint อยู่ใน NestJS process เดียวกัน — `MaterialsService` ฉีด `MailService` ผ่าน NestJS DI เพื่อ log audit (in-process call, transaction เดียวกับ business write — ไม่ต้องใช้ outbox/event bus)

### 7.4 Frontend Changes (เฉพาะ Sprint นี้)

- ปรับ `vite.config.ts` เพิ่ม dev proxy `/api` → `http://localhost:3000` (NestJS port)
- เพิ่ม `src/api/client.ts` (axios + `x-user-id` interceptor)
- เพิ่ม `src/api/materials.ts`, `src/api/uoms.ts`, `src/api/categories.ts` — **typed wrappers ใช้ Odoo field names** (`default_code`, `categ_id`, `uom_id`, `state`)
- เพิ่ม `src/hooks/useMaterials.ts`, `useMasters.ts` (`@tanstack/react-query` v5)
- เพิ่ม `src/pages/MaterialRegister.tsx` — form dynamic ตาม `categ_id` (ดึง JSON Schema จาก BE)
- แก้ `ProductList.tsx` → ใช้ hook + map `state` → label ภาษาไทยใน `PRODUCT_STATUS_META`
- แก้ปุ่ม "ส่งให้ตรวจสอบ" ใน `ProductDetail.tsx` → ยิง `action_submit`
- **ปรับ `src/types/index.ts`:** เพิ่ม alias type `MaterialDTO` ที่ใช้ Odoo field names + helper `toProductView(dto)` แปลงให้ component เดิมใช้งานได้ (ไม่ต้องรื้อ UI)
- เพิ่ม dependency (frontend): `@tanstack/react-query`, `axios`, `react-hook-form`, `zod`, `@hookform/resolvers`
- เพิ่ม dependency (backend): `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/swagger`, `prisma`, `@prisma/client`, `class-validator`, `class-transformer`, `zod`

---

## 7.5 Architecture Decision Record (ADR — Sprint 1)

> รายละเอียดเต็มอยู่ใน [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) — section นี้คือ decisions ที่ commit ไว้สำหรับ Sprint 1

| # | Decision | Tag | Rationale |
|---|---|:-:|---|
| ADR-01 | ตั้ง column ตาม Odoo: `default_code`, `categ_id`, `uom_id`, `state`, `active`, `create_uid`, `create_date`, `write_uid`, `write_date` | 🟦 | future migration → Odoo จริงทำได้ 1:1 |
| ADR-02 | UoM ใช้โครง `uom_category` + `uom_uom` (มี `factor`, `rounding`, `uom_type`) แม้ Sprint นี้ใช้แค่ FK | 🟦 | รองรับ multi-UoM conversion อนาคต |
| ADR-03 | Material Group ใช้ `product_category` (tree, parent_id, complete_name) + extension `prefix_5`, `account_id`, `needs_criticality` | 🟨 | tree พร้อมรองรับ subgroup Sprint หน้า |
| ADR-04 | Audit log ใช้ `mail_message` pattern (model + res_id + tracking JSONB) — **เขียนใน transaction เดียวกับ business write (in-process)** | 🟦 | tab "ประวัติ" ใน UI ใช้ pattern เดียวกัน, รองรับ comment Sprint หน้า, ไม่ต้องมี broker |
| ADR-05 | Engineering attributes เก็บใน `attributes` JSONB column + validate ด้วย JSON Schema per categ_id | 🟨 | flexible 13 groups, ไม่ต้อง alter table เมื่อเพิ่ม group |
| ADR-06 | Part Code Generator เป็น **custom service** ใช้ `part_code_seq` table + `SELECT FOR UPDATE` ป้องกัน race | 🟥 | กฎ BDT, Odoo `default_code` ไม่มี structure |
| ADR-07 | State machine: `draft → to_approve → confirmed → cancel`, alias UI = Draft / PendingReview / Active / Rejected | 🟦 | ตรง Odoo, lookup ที่ frontend `PRODUCT_STATUS_META` |
| ADR-08 | API endpoints ใช้ Odoo `action_*` convention (`action_submit`, `action_confirm`, `action_cancel`, `action_assign_runno`) | 🟦 | ทีมเข้าใจง่าย ถ้าเคยใช้ Odoo |
| ADR-09 | Description validator (UPPERCASE EN, ห้ามไทย, 2 ส่วน) เป็น custom — Odoo `name` เป็น free string | 🟥 | ตรงกฎคู่มือ §1.1.3 |
| ADR-10 | Duplicate detection เป็น service custom (categ + grade + dimensions ±5%) — return เป็น warning ไม่ block | 🟥 | ตรงกฎคู่มือ §3.1, Odoo search ปกติไม่เพียงพอ |
| ADR-11 | เก็บ `odoo_ref_id` (nullable) ใน `materials`, `product_category`, `uom_uom` ตั้งแต่ Sprint นี้ | 🟨 | เผื่อ sync Odoo ภายหลังโดยไม่ต้อง migration ใหม่ |
| ADR-12 | Auth ยังไม่ทำ JWT ใน Sprint 1 — ใช้ `x-user-id` header + lookup `res_users.id` | 🟦 | Schema เผื่อ `res_users` ตาม Odoo, Sprint 3 ต่อยอด JWT + `res_groups` |
| ADR-13 | ECO/Versioning manual `version` string ใน Sprint 1 — Sprint 2 ขึ้นไปย้ายไป `mrp_eco` pattern | 🟦 | ลดงาน Sprint 1, ไม่เสีย compatibility |
| ADR-14 | Substitute Part schema มี (`substitute_for`, `substitute_seq`) แต่ flow ยังไม่เปิดใน Sprint 1 | 🟥 | เก็บ schema ไว้ก่อน เพื่อไม่ต้อง migration เพิ่มภายหลัง |

#### Anti-pattern ที่ Sprint นี้จะไม่ทำ (ตาม ADR §7)

- ❌ ไม่สร้าง column แยกสำหรับทุก attribute (`height_h`, `web_tw`, ...) — ใช้ JSONB
- ❌ ไม่ hard-code 13 groups ใน enum TypeScript backend — ใช้ `product_category` master
- ❌ ไม่เก็บ `default_code` เป็น free string — มี check constraint length=10
- ❌ ไม่สร้าง audit table แยกของตัวเอง — ใช้ `mail_message`
- ❌ ไม่ implement RBAC แบบ custom — เผื่อ schema `res_users` ไว้สำหรับ `res_groups` ในอนาคต

---

## 8. Acceptance Criteria สำหรับ Sprint Demo

| # | Scenario | Expected |
|---|---|---|
| AC1 | กรอกฟอร์ม HR_SHAPE ครบทุก field → กด Save | row ใหม่ใน `materials` `state='draft'`, `default_code` เป็น `<prefix5>-PEND`, เห็นใน `GET /materials` |
| AC2 | กรอกฟอร์มซ้ำ (categ+grade+ขนาด ภายใน ±5%) | response มี `duplicates: [...]` พร้อม `match_score`, UI แสดง warning banner |
| AC3 | กรอก `description_sale` ภาษาไทย / lowercase | 422 พร้อม error code `INVALID_DESCRIPTION_FORMAT` |
| AC4 | กรอก HR_SHAPE แต่ขาด `web_tw` | 422 พร้อม error อ้าง JSON Schema path `/attributes/web_tw` |
| AC5 | เลือก `uom_id` ที่ไม่ active | 422 FK violation |
| AC6 | กด "ส่งให้ตรวจสอบ" จาก state `draft` | state → `to_approve`, `mail_message` เพิ่ม row tracking diff, UI pill เป็น "รอตรวจสอบ" |
| AC7 | เปิด `/api/docs` | Swagger UI โชว์ endpoints ทั้งหมด ใช้ Odoo field names ใน schema |
| AC8 | run `npm test` ใน `apps/api` | green, coverage ≥70% รวม Validators 100% |
| AC9 | สร้างวัสดุ 2 ตัวพร้อมกันใน prefix เดียวกัน (load test 10 concurrent) | `default_code` ไม่ซ้ำ — `part_code_seq` lock ทำงานถูกต้อง |
| AC10 | `GET /materials/:default_code/messages` | ได้ list `mail_message` ตามลำดับ (create + update + submit) |

---

## 9. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Subgroup ในเอกสารไม่ครบ 13 กลุ่ม (มีเฉพาะ 1–7) | High | Medium | Sprint นี้ seed แค่ 7 groups, เลื่อน 8–13 ไป Sprint 2 — ตั้ง open question ใน §11 |
| react-query v5 + React 19 ปัญหาเข้ากัน | Medium | Low | ใช้ `@tanstack/react-query@5.x` ทดสอบ peer deps ใน D1 |
| Part Code Generator concurrency (run number ซ้ำ) | Low | High | ใช้ `part_code_seq` table + `SELECT FOR UPDATE` ใน transaction (ADR-06) — มี AC9 test |
| Duplicate detection กิน CPU เมื่อข้อมูลโต | Low | Low | index GIN บน `attributes`, จำกัด query ภายใน `categ_id` เดียวกัน |
| Team ใหม่กับ NestJS | Medium | Medium | Pair programming D1–D2, ใช้ Nest CLI scaffold ลด boilerplate |
| **ทีมไม่เคยใช้ Odoo conventions มาก่อน** | Medium | Medium | Onboarding 30 min ใน Day 1 — review ADR + ตัวอย่าง Odoo schema; pair review PR ที่กระทบ schema |
| ใช้ Odoo naming อาจดู verbose สำหรับทีม FE | Low | Low | ทำ helper `toProductView(dto)` ใน FE — component เดิมไม่ต้องรื้อ (D1) |
| Modular monolith ปนกัน (cross-module call ไม่ระวัง) → ภายหลังแยก service ยาก | Medium | Medium | บังคับ rule: cross-module ต้องผ่าน `*.service.ts` ที่ export จาก `*.module.ts` เท่านั้น (ห้าม import file ภายในตรงๆ); ESLint rule บังคับ; ดู §12 Migration Path ใน MICROSERVICES_PLAN |
| Backend dev port (3000) ชนกับ Vite (5173) | Low | Low | NestJS ใช้ 3000, Vite ใช้ 5173, proxy `/api` ตั้งใน vite.config.ts |

---

## 10. Sprint Roadmap (Preview Sprint 2 +)

> ทุก Sprint ทำใน **monolith เดียวกันต่อ** — ยังไม่แยก microservice จนกว่าโหลดหรือทีมจะโต (เกณฑ์: >5 BE devs, traffic >100 RPS sustained, หรือมี service ที่ scale แยกชัด)

| Sprint | Theme | Highlight | Tag |
|---|---|---|:-:|
| **2** | Approval flow + Warehouse run number + Substitute Part | `action_confirm` (Reviewer), `action_assign_runno` (Warehouse), Substitute (เปลี่ยนหลัก 4) flow, Notification email/Line (ใน module เดียวกัน) | 🟦+🟥 |
| **3** | Master extension + RBAC | Subgroup + รหัสบัญชี เต็มทุก 13 กลุ่ม, Criticality A/B/C, JWT + `res_groups` (Sales/Stock/MRP) | 🟦+🟨 |
| **4** | ECO migration + BIM/Dashboard | ย้าย versioning ไป `mrp_eco` pattern, BIM webhook, Drawing system link | 🟦+🟥 |
| **5** | Odoo integration จริง | XML-RPC sync `materials` ↔ `product.product`, mapping `odoo_ref_id` | 🟦 |
| **6** | Reporting & Bulk ops | Material aging, duplicate report, Bulk import Excel (xlsx skill), Master export | 🟦+🟥 |
| **7+** | (Conditional) Microservice extraction | ถ้าโหลด/ทีม trigger เกณฑ์ → strangle module ออกตาม [`MICROSERVICES_PLAN.md`](./MICROSERVICES_PLAN.md) §12 (เริ่มจาก audit-service ก่อน เพราะแยกง่ายสุด) | 🟦 |

---

## 11. Open Questions (ต้องถาม Stakeholder ก่อน Sprint Planning)

1. กลุ่มที่ 8–13 ในตาราง — ขอตารางเต็ม Subgroup + รหัสบัญชี
2. กฎ Substitute Part หลักที่ 4 มี mapping table หรือเปล่า (เช่น 1=A, 2=B, …)
3. ใครเป็น "คลังวัสดุ" run number — มี 1 คนหรือทีม? ต้อง role อะไร?
4. ระบบเดิม (SAP 2000?) ยังใช้คู่ขนานหรือเปล่า? ต้อง migrate data เก่าหรือไม่?
5. รูปแบบรหัสที่ใช้กับ Spare Part / Fixed Asset ที่ "Criticality" จะ encode ที่หลักไหน?

---

*Prepared by: BDT App Engineering — Sprint Planning v0.3 (Monolith — FE + BE in 1 repo, aligned with ADR Standardize-vs-Custom-Odoo)*
