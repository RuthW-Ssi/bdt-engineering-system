# Sprint 4.1 Implementation Plan — Routing + Work Center + Std Time

> ## ⚠️ AMENDED 2026-04-29 — see [`SPRINT_PLAN_ROUTING_STD_TIME_4_2.md`](./SPRINT_PLAN_ROUTING_STD_TIME_4_2.md)
>
> User adopted **Option 3 (Hybrid)** routing pattern — see [`GAP_ANALYSIS_ROUTING_PATTERN.md`](./GAP_ANALYSIS_ROUTING_PATTERN.md). The schema in §4 of THIS document (per-product `mrp_routing_workcenter` rows) is **superseded**. Sprint 4.2 introduces:
>
> - `routing_template` (NEW) — replaces `mrp_routing_workcenter.product_id`
> - `routing_op_activity` (NEW junction) — connects op to activities
> - `product_routing_override` (NEW sparse) — per-activity overrides
> - `custom_routing` + `custom_routing_op` + `custom_routing_activity` (NEW escape hatch)
> - `routing_template_binding_rule` (NEW) — auto-bind table
>
> Stories RT1, RT2, RT3, RT9, RT11, RT12, RT13, RT14, RT17 below need amendment per Sprint 4.2 §6 reconciliation table.
>
> **Recommended:** treat Sprint 4.1 + 4.2 as one combined 10-day delivery — Claude Code applies single migration file. See Sprint 4.2 §6 + §10 for hand-off details.
>
> ---
>
> # Sprint 4.1 Implementation Plan — Routing + Work Center + Std Time
>
> **Project:** BDT Engineer Management System
> **Sprint:** 4.1 (Routing + Std Time — original plan)
> **Length:** 5 working days, 2 devs (≈ 80 h capacity)
> **Date:** 2026-04-29 (planning) — kickoff after Sprint 3 lands
> **Architecture:** Monolith — extend existing `backend/` + `src/` (Sprint 3 BOM+Drawings)
>
> **🎯 Sprint Goal:** ระบบรองรับ **Production Routing (template + per-product)**, **Work Center master (Odoo + ISA-95 enriched)**, **Activity Template + Cycle-Time Formula Engine** สำหรับงานเหล็กโครงสร้าง — ทดแทน xlsx ทั้ง 2 ไฟล์ใน `bdt-app/document/`
>
> **Companion docs:**
> - [`GAP_ANALYSIS_ROUTING_STDTIME.md`](./GAP_ANALYSIS_ROUTING_STDTIME.md) — research, ADR, gap matrix (read this first)
> - [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) — Odoo ADR
> - [`SPRINT_PLAN_BOM_DRAWINGS.md`](./SPRINT_PLAN_BOM_DRAWINGS.md) — Sprint 3 (consume product_bom + lines)
> - [`SPRINT_PLAN_PRODUCT.md`](./SPRINT_PLAN_PRODUCT.md) — Sprint 2 (consume products.attributes JSONB)
>
> **Prerequisite:** Sprint 1-3 schema (materials, products, product_bom, shop_drawing) must exist + be migrated.
>
> **Practice basis:** **Odoo 17 MRP** (primary) + **Siemens Opcenter Execution / ISA-95** (enrichment for OEE A/P/Q split, Resource hierarchy) + **AISC steel-shop practice** (workflow validation).
>
> **As-is after Sprint 3:**
> ```
> backend/src/modules/
>   ├── identity/, master-data/, materials/, mail/        [ Sprint 1 ]
>   ├── projects/, project-zones/, mark-prefix-master/    [ Sprint 2 ]
>   ├── products/                                          [ Sprint 2 ]
>   └── boms/, drawings/, file-storage/                    [ Sprint 3 ]
>
> src/
>   ├── pages/ProductList.tsx, ProductDetail.tsx           [ Sprint 1+2 ]
>   ├── pages/BomEditor.tsx, BomDiffReview.tsx             [ Sprint 3 — real API ]
>   ├── pages/RoutingList.tsx, RoutingEditor.tsx           [ Sprint 1 mock — Sprint 4 wires real ]
>   └── store/routingStore.ts                              [ Sprint 1 mock — replace ]
> ```

---

## 1. Sprint 4 Scope

### 1.1 In-scope ✅

- **Schema + seed** — 4 new tables matching Odoo MRP convention:
  - `mrp_workcenter` (🟨 Hybrid — Odoo + OEE A/P/Q split + Labor Mix + Cost components)
  - `mrp_routing_workcenter` (🟦 Standard Odoo — operations on routing)
  - `routing_activity_template` (🟥 Custom — activities under operation, with formula param)
  - `routing_formula_param` (🟥 Custom — cycle-time formula registry)
- **Cycle Time Engine** (🟥 Custom service) — evaluates formula against product attributes, returns per-activity / per-op / total time
- **Std Cost calculator** — uses WC cost rates, populates `products.cost_production`
- **Routing CRUD API** (🟦 Odoo-compatible)
- **Routing Editor (FE)** — replace mock store with real API; show formula preview live
- **Work Center Master Page (FE)** — list, edit OEE A/P/Q, edit Labor Mix, edit cost rates
- **Activity Template Master Page (FE)** — read-only view of 923 templates; edit per-product override
- **Recompute UI** — button on product page → recompute cycle time + cost
- **xlsx seed importer** — one-shot script to import both xlsx files into seed tables

### 1.2 Out-of-scope ❌

| Deferred to | Item |
|---|---|
| Sprint 5 | Manufacturing Order / Work Order (`mrp_production`, `mrp_workorder`) |
| Sprint 5 | Tekla 4-file import that creates routings |
| Sprint 5 | ECO over routing (currently routing edit is unrestricted; Sprint 5 adds gate) |
| Sprint 5 | BOM line ↔ Routing operation linkage (`bom_line.operation_id`) |
| Sprint 5 | sROUTE / mROUTE views (parallel of sBOM/mBOM in Sprint 3) — Sprint 4 ships eROUTE only |
| Sprint 6 | Maintenance & equipment register (220 items) |
| Sprint 6 | Routing-step quality check plans |
| Sprint 7 | Finite capacity scheduling / jig contention |
| Sprint 7 | Real-time OEE telemetry / shop floor productivity |

### 1.3 Out-of-band integrations (parallel to Sprint 4)

- **Sprint 5 prep:** `bom_line.operation_id` column added now as nullable INT — populated by Sprint 5 import.
- **Costing prep:** `products.cost_production` (Sprint 2 column, Decimal(12,2), nullable) is the target field this sprint writes to.

---

## 2. Backlog (User Stories)

> **Tag legend:** 🟦 Standard (Odoo)  ·  🟨 Hybrid (extend)  ·  🟥 Custom (BDT-only)

### Epic A — Schema & Seed (12 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT1** | 🟦 | Prisma migration: 4 new tables `mrp_workcenter`, `mrp_routing_workcenter`, `routing_activity_template`, `routing_formula_param` + 2 nullable FK on `bom_line` (`operation_id`) and `products` (`routing_id`) | 4 h | migrate dev success; FKs nullable; CHECK constraints `oee_components_sum_positive`, `labor_mix_sum_100`; rollback tested |
| **RT2** | 🟥 | xlsx seed importer (`prisma/import-routing-xlsx.ts`) — parses both files via `xlsx` lib; populates 4 work centers, 28 routing ops, 923 activity templates, 19 formula params; idempotent | 4 h | re-run safe (uses upsert); summary report logged; runs in <30 s |
| **RT3** | 🟥 | Seed sample 0X202 routing — `WH-CO-1 Column` (1236 kg, 12 m, 4 sub-parts) gets a fully-computed routing using the imported activity templates | 2 h | `prisma/seed.ts` populates; test compute returns ~7000 min total (within ±15% of MO sheet) |
| **RT4** | 🟦 | Mail audit hooks for routing create/update/state-change | 2 h | reuses Sprint 1 `MailMessageService`; tracking JSONB on every change |

### Epic B — Cycle Time Formula Engine (16 h) 🟥 Custom

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT5** | 🟥 | `FormulaService` — safe expression evaluator using `expr-eval` (whitelist: + - × / ceil floor round abs min max, named attributes only). Reject `eval`, function definitions. | 4 h | 12 unit tests (incl. injection attempts); rejects `__import__`, `process.env`, etc. |
| **RT6** | 🟥 | `CycleTimeService.compute(productId, routingId)` — pulls product attrs, walks routing.ops → ops.activities → eval formula → aggregate up. Returns nested object. | 6 h | service unit tests (4 sample products × 4 routings); handles missing attr (returns 400 with reason); supports 1- and 2-parameter activities |
| **RT7** | 🟥 | Cache layer: per-product `routing_compute_cache` table keyed by `sha256(product.attrs + routing.version + activity.version)` | 3 h | cache hit returns in <50 ms; auto-invalidate on attribute UPDATE trigger |
| **RT8** | 🟦 | `StdCostService.compute(productId)` — multiplies cycle time × WC cost rates + adds consumable aggregate; writes `products.cost_production` | 3 h | matches Summary sheet costs ±5% on the 12 reference machines |

### Epic C — Routing API (16 h) 🟦 Odoo-compat

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT9** | 🟦 | `RoutingsModule`: GET/POST/PATCH `/products/:code/routing` + GET `/routings/:id` + state machine (`draft → active → obsolete`) | 6 h | Swagger docs; only 1 active routing per product (DB partial-unique index on `(product_id, state)` where state=active) |
| **RT10** | 🟦 | `WorkcentersModule`: full CRUD on `mrp_workcenter` + GET `/workcenters/:id/capacity` returns `{kg, m, pc}/month` | 4 h | seeded WCs immutable for code/name; OEE/cost editable; audit logged |
| **RT11** | 🟥 | `ActivityTemplatesModule`: GET `/activity-templates?op_code=` + PATCH for per-product override (creates a `routing_step` row that shadows template) | 3 h | template list paginated; override creates new row, doesn't mutate template |
| **RT12** | 🟦 | `RecomputeController`: POST `/products/:code/routing/recompute` → triggers cycle time + std cost → returns full tree | 3 h | sync mode for single product; async batch for project (returns 202 + job id) |

### Epic D — Frontend (24 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT13** | 🟨 | Replace `routingStore.ts` mock store with real API hooks: `useRouting(productCode)`, `useRoutingTemplates()`, `useActivityTemplates(opCode)`, `useWorkcenters()` | 6 h | mock data stays as fallback when API unreachable (dev mode); React Query cache 5-min TTL |
| **RT14** | 🟨 | Extend `RoutingEditor.tsx` (existing UI) → real API: load operations + activities tree; show per-activity cycle time live; "Recompute" button | 8 h | uses `useRouting` hook; expand/collapse op level; shows formula trace tooltip ("buildup_weight = sumWeight × 0.8 = 1989 kg → ceil(1989/500)×10 = 40 min") |
| **RT15** | 🟦 | New page `WorkcenterMaster.tsx` — list 4 WCs as cards; edit modal: OEE A/P/Q sliders + Labor Mix split + 4 cost components | 5 h | computed `oee = a×p×q` shown live; sum of labor mix must equal 100% (validation); mail_message log on save |
| **RT16** | 🟥 | New page `ActivityTemplateMaster.tsx` — searchable table of 923 activity templates grouped by operation; click → modal with formula preview using sample inputs | 3 h | filter by operation, work_center, formula_param; preview computes against editable input form |
| **RT17** | 🟦 | `ProductDetail.tsx` add "Routing" tab — shows routing summary card (total_time, total_cost, last_recomputed_at) + drill-down to RoutingEditor | 2 h | tab visible only when product has active routing; "Compute" CTA when routing is draft |

### Epic E — Quality & Docs (12 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT18** | 🟦 | Unit tests BE: FormulaService (12), CycleTimeService (8), StdCostService (4), RoutingService (6) ≥80% coverage | 5 h | `npm test --coverage` green |
| **RT19** | 🟦 | E2E (supertest): seed 0X202 → POST routing/recompute → assert cycle time within ±15% of MO sheet → assert `products.cost_production` written | 3 h | green; runs in <30 s |
| **RT20** | 🟥 | Compute-correctness audit: pick 5 reference rows from xlsx Summary sheet (CNC Plate Plasma, SAW, Drill, Press Brake, Threading); compare engine output vs xlsx | 2 h | spreadsheet-style report committed to `docs/sprint4/compute-audit.md`; deltas explained |
| **RT21** | 🟦 | Swagger + CHANGELOG.md + README.md updated; ADR file `docs/adr/0004-routing-formula-engine.md` | 2 h | doc reviewed; matches API |

**Total estimate:** 12 + 16 + 16 + 24 + 12 = **80 h** ✅

**Tag mix:** 🟦 ~45% / 🟨 ~20% / 🟥 ~35% — heavier custom because the formula engine and activity granularity are not in Odoo. Mix matches Sprint 3 (BOM+Drawings) ratio.

---

## 3. Sprint Schedule (5 days × 2 devs)

| Day | Dev A — Backend / Engine | Dev B — Frontend / UX |
|:-:|---|---|
| **D1** | RT1 (4h) Prisma migration · RT4 (2h) audit hooks · RT5 (2h) FormulaService skeleton | RT13 (6h) replace mock store with real API hooks · scaffold WorkcenterMaster route |
| **D2** | RT5 (2h) FormulaService finish · RT6 (6h) CycleTimeService | RT14 (8h) RoutingEditor real-API + formula trace tooltip |
| **D3** | RT2 (4h) xlsx seed importer · RT7 (3h) cache layer · RT8 (1h) StdCostService start | RT15 (5h) WorkcenterMaster page · RT17 (2h) Routing tab on ProductDetail · RT16 (1h) ActivityTemplateMaster scaffold |
| **D4** | RT8 (2h) StdCostService finish · RT9 (6h) RoutingsModule API | RT16 (2h) ActivityTemplateMaster table · RT14 polish · RT13 polish |
| **D5** | RT10+RT11+RT12 (10h) WC API + Templates API + Recompute · RT3 (1h) sample seed | RT18-RT21 share with Dev A: tests, docs, compute audit |

Day 5 afternoon = bug-bash + demo prep.

---

## 4. Data Model (Prisma)

### 4.1 New tables

```prisma
// ── 🟨 Work Center (Odoo mrp.workcenter + ISA-95/Siemens enrichment) ──
model mrp_workcenter {
  id                       Int       @id @default(autoincrement())
  code                     String    @unique @db.VarChar(20)        // 'WC-BU', 'WC-AS', 'WC-PT', 'WC-PR'
  name                     String    @db.VarChar(60)                // 'Built Up', 'Assembly', 'Painting', 'Prepare Material'
  sequence                 Int       @default(10)
  active                   Boolean   @default(true)
  // Capacity & calendar
  capacity                 Decimal   @default(1.0) @db.Decimal(8, 2)         // # parallel
  working_hours_per_week   Decimal   @default(40)  @db.Decimal(6, 2)
  time_efficiency          Decimal   @default(100) @db.Decimal(5, 2)         // %
  time_start               Decimal   @default(0)   @db.Decimal(8, 2)         // setup min
  time_stop                Decimal   @default(0)   @db.Decimal(8, 2)         // teardown min
  // OEE — Siemens / ISA-95 A × P × Q split
  oee_target               Decimal   @default(90)  @db.Decimal(5, 2)         // forecast %
  availability             Decimal   @default(100) @db.Decimal(5, 2)         // actual A %
  performance              Decimal   @default(100) @db.Decimal(5, 2)         // actual P %
  quality                  Decimal   @default(100) @db.Decimal(5, 2)         // actual Q %
  // oee = a × p × q (computed in service layer; not stored as generated col due to Prisma limits)
  // BDT-custom: Labor Mix
  labor_mix                Json      @default("{\"operator\":100,\"skilled\":0,\"group_head\":0}")
  // Cost components (THB/min, all positive)
  labor_cost_per_min       Decimal   @default(0) @db.Decimal(10, 4)
  electricity_cost_per_min Decimal   @default(0) @db.Decimal(10, 4)
  consumable_cost_per_min  Decimal   @default(0) @db.Decimal(10, 4)
  overhead_cost_per_min    Decimal   @default(0) @db.Decimal(10, 4)
  // Capacity per period (snapshot from xlsx Summary)
  capacity_per_period      Json?     // {kg_per_month, m_per_month, pc_per_month}
  // ISA-95 hierarchy
  parent_id                Int?
  parent                   mrp_workcenter?  @relation("WCParent", fields: [parent_id], references: [id])
  children                 mrp_workcenter[] @relation("WCParent")
  resource_type            String    @default("workcenter") @db.VarChar(20)  // enterprise|site|area|workcenter|workunit|equipment
  // Tags / shared resources
  shared_resource_tag      String?   @db.VarChar(40)        // e.g., 'jig-A' so buildup-fit & buildup-weld share
  // Audit
  odoo_ref_id              String?   @db.VarChar(40)
  create_uid               Int
  create_user              res_users @relation("wc_create", fields: [create_uid], references: [id])
  create_date              DateTime  @default(now()) @db.Timestamptz
  write_uid                Int
  write_user               res_users @relation("wc_write", fields: [write_uid], references: [id])
  write_date               DateTime  @default(now()) @db.Timestamptz

  routing_workcenters      mrp_routing_workcenter[]
  activity_templates       routing_activity_template[]
}

// ── 🟦 Routing-Workcenter (Odoo mrp.routing.workcenter) ──
model mrp_routing_workcenter {
  id                  Int             @id @default(autoincrement())
  product_id          Int?            // null = template (Accessory/Main/False)
  product             products?       @relation("ProductRouting", fields: [product_id], references: [id])
  routing_template    String?         @db.VarChar(20)        // 'Main', 'Accessory', 'False' for templates
  name                String          @db.VarChar(60)        // operation name e.g., 'buildup-fit'
  op_code             String          @db.VarChar(30)        // 'buildup_fit' | 'buildup_welding' | 'fitup' | 'welding' | 'primer' | 'fireproof' | 'topcoat' | …
  sequence            Int             @default(10)
  workcenter_id       Int
  workcenter          mrp_workcenter  @relation(fields: [workcenter_id], references: [id])
  // Time (Odoo-compat)
  time_cycle          Decimal         @default(0) @db.Decimal(10, 4)  // computed cache (min/unit)
  time_cycle_manual   Decimal?        @db.Decimal(10, 4)              // override
  time_mode           String          @default("formula") @db.VarChar(10)  // formula | manual | template
  // BDT-custom
  routing_view        String          @default("eRoute") @db.VarChar(10)   // eRoute | mRoute (Sprint 5)
  state               String          @default("draft") @db.VarChar(20)
  // Computed cache
  last_computed_at    DateTime?       @db.Timestamptz
  cache_key           String?         @db.VarChar(64)        // sha256
  // Dependencies (Sprint 5+)
  blocked_by_op_ids   Int[]                                  // graph
  // Audit
  create_uid          Int
  create_user         res_users       @relation("rwc_create", fields: [create_uid], references: [id])
  create_date         DateTime        @default(now()) @db.Timestamptz
  write_uid           Int
  write_user          res_users       @relation("rwc_write", fields: [write_uid], references: [id])
  write_date          DateTime        @default(now()) @db.Timestamptz

  activities          routing_step_activity[]

  @@index([product_id])
  @@index([routing_template])
  @@unique([product_id, sequence], map: "ux_routing_op_seq_per_product")
}

// ── 🟥 Activity Template (BDT-custom — sub-operation granularity) ──
model routing_activity_template {
  id                  Int       @id @default(autoincrement())
  op_code             String    @db.VarChar(30)             // FK by code, not id (matches xlsx)
  description         String    @db.VarChar(200)            // '3.1 ยกชิ้นงานขึ้น Jig'
  sequence            Int       @default(10)
  include_idle        Boolean   @default(false)             // 'Y' / 'N' from xlsx
  // Primary param
  per_minute          Decimal   @db.Decimal(10, 4)          // rate (min)
  formula_param_code  String    @db.VarChar(40)             // 'buildup_weight'
  formula_param       routing_formula_param @relation("Param1", fields: [formula_param_code], references: [code])
  std_measure         Decimal   @db.Decimal(12, 4)          // 500
  unit                String    @db.VarChar(20)             // 'kilogram'
  // Secondary param (welding multi-ratio)
  formula_param_code2 String?   @db.VarChar(40)
  formula_param2      routing_formula_param? @relation("Param2", fields: [formula_param_code2], references: [code])
  std_measure2        Decimal?  @db.Decimal(12, 4)
  unit2               String?   @db.VarChar(20)
  // Resourcing
  manpower            Decimal   @default(1) @db.Decimal(4, 2)
  workcenter_id       Int
  workcenter          mrp_workcenter @relation(fields: [workcenter_id], references: [id])
  equipment_ref       String?   @db.VarChar(120)            // free text Sprint 4; FK Sprint 6
  consumable_note     String?   @db.VarChar(200)            // 'ลวดเชื่อม Flux core 1.2, CO2'
  utilities_note      String?   @db.VarChar(40)             // 'ไฟ' | 'ไม่มี'
  // Versioning
  version             String    @default("1.0") @db.VarChar(20)
  active              Boolean   @default(true)
  source              String    @default("xlsx_seed") @db.VarChar(20)   // xlsx_seed | manual | imported
  // Audit
  create_uid          Int
  create_user         res_users @relation("act_create", fields: [create_uid], references: [id])
  create_date         DateTime  @default(now()) @db.Timestamptz
  write_uid           Int
  write_user          res_users @relation("act_write", fields: [write_uid], references: [id])
  write_date          DateTime  @default(now()) @db.Timestamptz

  steps               routing_step_activity[]

  @@index([op_code])
}

// Per-routing-step instance of an activity (allows per-product overrides without mutating template)
model routing_step_activity {
  id                    Int       @id @default(autoincrement())
  routing_workcenter_id Int
  routing_workcenter    mrp_routing_workcenter @relation(fields: [routing_workcenter_id], references: [id], onDelete: Cascade)
  activity_template_id  Int
  activity_template     routing_activity_template @relation(fields: [activity_template_id], references: [id])
  sequence              Int       @default(10)
  // Override fields (null = inherit from template)
  per_minute_override   Decimal?  @db.Decimal(10, 4)
  std_measure_override  Decimal?  @db.Decimal(12, 4)
  manpower_override     Decimal?  @db.Decimal(4, 2)
  // Computed cache
  last_cycle_time_min   Decimal?  @db.Decimal(10, 4)
  last_input_snapshot   Json?     // {sumWeight: 2000, length: 12, …}
  last_computed_at      DateTime? @db.Timestamptz

  @@index([routing_workcenter_id])
}

// ── 🟥 Formula Parameter (BDT-custom) ──
model routing_formula_param {
  code                String    @id @db.VarChar(40)         // 'buildup_weight'
  description         String    @db.VarChar(200)
  formula_expression  String    @db.VarChar(400)            // 'sumWeight * 0.8' | 'Length * 2 + Width * 2'
  inputs_required     String[]  // ['sumWeight'] | ['Length', 'Width']
  return_unit         String    @db.VarChar(20)             // 'kilogram' | 'meter'
  applies_to_groups   String[]  // ['BEAM', 'PEB'] | ['PIPE']
  active              Boolean   @default(true)
  // Audit
  create_date         DateTime  @default(now()) @db.Timestamptz
  write_date          DateTime  @default(now()) @db.Timestamptz

  templates_primary   routing_activity_template[] @relation("Param1")
  templates_secondary routing_activity_template[] @relation("Param2")
}
```

### 4.2 Schema additions to existing tables

```prisma
// products (Sprint 2) — add 1 nullable FK
model products {
  // … existing fields …
  active_routing_id Int?
  active_routing    mrp_routing_workcenter? @relation("ProductActiveRouting", fields: [active_routing_id], references: [id])
}

// product_bom_line (Sprint 3) — add operation linkage (Sprint 5 will populate; nullable now)
model product_bom_line {
  // … existing fields …
  operation_id Int?
  operation    mrp_routing_workcenter? @relation("BomLineOp", fields: [operation_id], references: [id])
}
```

### 4.3 Constraints (raw SQL migration)

```sql
-- Only one active routing per product
CREATE UNIQUE INDEX ux_product_active_routing
  ON mrp_routing_workcenter (product_id)
  WHERE state = 'active' AND product_id IS NOT NULL;

-- OEE component sanity (each in [0,1])
ALTER TABLE mrp_workcenter
  ADD CONSTRAINT ck_wc_oee_components CHECK (
    availability BETWEEN 0 AND 100
    AND performance BETWEEN 0 AND 100
    AND quality BETWEEN 0 AND 100
  );

-- Labor mix sums to ~100
ALTER TABLE mrp_workcenter
  ADD CONSTRAINT ck_wc_labor_mix_sum CHECK (
    (labor_mix->>'operator')::numeric
  + (labor_mix->>'skilled')::numeric
  + (labor_mix->>'group_head')::numeric
  BETWEEN 99.5 AND 100.5
  );

-- Cost components non-negative
ALTER TABLE mrp_workcenter
  ADD CONSTRAINT ck_wc_costs_nonneg CHECK (
    labor_cost_per_min       >= 0
    AND electricity_cost_per_min >= 0
    AND consumable_cost_per_min  >= 0
    AND overhead_cost_per_min    >= 0
  );

-- Activity template: per_minute & std_measure positive
ALTER TABLE routing_activity_template
  ADD CONSTRAINT ck_act_pos CHECK (per_minute > 0 AND std_measure > 0);
```

---

## 5. API Endpoints (Sprint 4)

```
# Routing master
GET    /api/v1/products/:code/routing                       # active routing tree
POST   /api/v1/products/:code/routing                       # create from template
PATCH  /api/v1/products/:code/routing                       # edit ops
DELETE /api/v1/products/:code/routing/:opId
POST   /api/v1/products/:code/routing/action_activate
POST   /api/v1/products/:code/routing/action_obsolete
POST   /api/v1/products/:code/routing/recompute             # recompute cycle time + cost
GET    /api/v1/routings/templates                           # list 3 templates (Main/Accessory/False)
GET    /api/v1/routings/:id                                 # routing detail (admin/debug)

# Workcenter master
GET    /api/v1/workcenters
POST   /api/v1/workcenters                                  # admin only
GET    /api/v1/workcenters/:id
PATCH  /api/v1/workcenters/:id
GET    /api/v1/workcenters/:id/capacity                     # {kg, m, pc}/month
POST   /api/v1/workcenters/:id/recompute_capacity           # rebuild from xlsx-style inputs

# Activity templates
GET    /api/v1/activity-templates?op_code=&workcenter_id=   # paginated list
GET    /api/v1/activity-templates/:id
PATCH  /api/v1/activity-templates/:id                       # admin only (creates new version)
POST   /api/v1/activity-templates/:id/preview               # body: {productId} → returns cycle time without saving

# Formula parameters
GET    /api/v1/formula-params
POST   /api/v1/formula-params                               # admin only
PATCH  /api/v1/formula-params/:code

# Costing
POST   /api/v1/products/:code/std-cost/recompute            # writes products.cost_production
GET    /api/v1/products/:code/std-cost                      # breakdown by op + WC
```

All responses follow Sprint 1-3 envelope `{ data, meta, errors }`.

---

## 6. UX / UI Specification

### 6.1 Information Architecture

```
ProductDetail (existing — Sprint 2)
  ├── Tab: Overview
  ├── Tab: BOM           (Sprint 3)
  ├── Tab: Drawings      (Sprint 3)
  └── Tab: Routing       ← NEW Sprint 4
        ├── Summary card (total time, total cost, last computed)
        ├── Op timeline strip (visual sequence of ops)
        └── "Open Editor" → /products/:code/routing/edit

RoutingEditor (extend existing mock at src/pages/RoutingEditor.tsx)
  ├── Header: product summary + Activate/Obsolete actions
  ├── Left panel: Op list (drag-drop reorder + add/delete)
  ├── Right panel: per-op activity tree
  │     ├── Activity row: name + formula trace + cycle time
  │     └── "Override" link → in-place edit per_minute / std_measure
  ├── Bottom bar: total time + total cost + "Recompute" button
  └── Floating "Trace" panel: shows formula evaluation step-by-step

WorkcenterMaster (NEW — /admin/workcenters)
  ├── Cards: 4 work centers with OEE gauge, Labor Mix donut, Cost stack
  └── Edit modal: 3 sliders (A/P/Q) + Labor Mix split + 4 cost inputs

ActivityTemplateMaster (NEW — /admin/activity-templates)
  ├── Filter bar: op_code, workcenter, formula_param, search
  ├── Table: 923 rows paginated
  └── Row click → modal: formula preview against editable sample inputs
```

### 6.2 Wireframes (text spec)

**Routing Tab on ProductDetail:**
```
╭───────────────────────────────────────────────────────────────╮
│ Routing — WH-CO-1 Column                          [ active ]  │
├───────────────────────────────────────────────────────────────┤
│ Total time: 7,248 min (≈ 121 h)   Total cost: ฿ 14,520        │
│ Last computed: 2026-04-29 10:23                               │
│ ─────────────────────────────────────────────────────────────│
│ [PREP] → [BUILD-UP-FIT] → [BUILD-UP-WELD] → [FIT-UP] → …      │
│   (10 ops, all green)                                          │
├───────────────────────────────────────────────────────────────┤
│ [ Open Editor ] [ Recompute ] [ History ]                     │
╰───────────────────────────────────────────────────────────────╯
```

**RoutingEditor — activity row:**
```
╭───────────────────────────────────────────────────────────────╮
│ ▼ Op 30 · BUILDUP-WELDING · WC: Built Up · 1,860 min          │
│   ╭─ 4.1 Lift workpiece onto Station         · 25 min · ⓘ    │
│   │  ⓘ buildup_weight = sumWeight × 0.8 = 1989 kg            │
│   │      ceil(1989/500) × 5 = 4 × 5 = 20 min                  │
│   │      product_length / 6m = 12/6 = 2x                      │
│   │      → 20 × 2 = 40 min  ✓                                 │
│   ╰─ [Override per_minute] [Override std_measure]             │
│   ─ 4.2 Set current & weld speed             · 10 min        │
│   ─ 4.3 Weld bead 1st side                   · 60 min        │
│   ─ 4.4 Flip workpiece                        · 6 min        │
│   ─ 4.5 Weld bead 2nd side                   · 240 min       │
│   …                                                           │
╰───────────────────────────────────────────────────────────────╯
```

**WorkcenterMaster card:**
```
╭───────────────────────────────────────────────────────────────╮
│ [WC-BU] Built Up                                  [edit]      │
├───────────────────────────────────────────────────────────────│
│ OEE         Labor Mix              Cost (THB/min)             │
│ A: 92%      ◐ Operator 50%         Labor       1.45           │
│ P: 95%      ◐ Skilled  40%         Electricity 0.18           │
│ Q: 99%      ◐ Group H. 10%         Consumable  0.32           │
│ = 86.5%                              Overhead    0.85          │
│                                      ──────────────            │
│                                      Total      2.80           │
│                                                               │
│ Capacity: 691 t/month plate · 144 t/month SAW                │
╰───────────────────────────────────────────────────────────────╯
```

### 6.3 Interaction details

- **Formula trace tooltip:** ⓘ icon next to cycle time → tooltip shows formula expansion + intermediate values (read-only). Helps engineers debug "why is this 40 min?"
- **Override flow:** clicking "Override" on activity row turns row into edit form (no modal); save → creates `routing_step_activity` override row, recomputes cycle time live.
- **Recompute button:** single product = sync (<500 ms); project-wide = opens job-status dialog.
- **State transitions visible:** draft routing has yellow border; active = green; obsolete = greyed out.
- **Undo:** Sprint 4 ships with no undo (to avoid scope creep). Document this for users.

### 6.4 Reuse existing components

- `StatusPill` (`src/components/ui/StatusPill.tsx`) — for routing state
- `OpBadge` (`src/components/ui/OpBadge.tsx`) — for op_code visualisation
- `OP_META` (`src/data/meta.ts`) — extend with new ops: `BUILDUP_FIT`, `BUILDUP_WELD`, `PRIMER`, `FIREPROOF`, `TOPCOAT` (current set: CUT/WELD/DRILL/PAINT/QC/BEND/GRIND/SHEAR/ASSEMBLE — not enough)
- `fmtTime`, `fmtDate` (`src/data/utils.ts`)
- `useBom`, `useDrawings` patterns from Sprint 3 — copy to `useRouting`

### 6.5 Responsive / accessibility

- Min viewport: 1280 × 800 (engineering laptops); mobile not in scope
- Keyboard: ↑/↓ to navigate ops, Enter to expand, Tab to next field in edit mode
- Screen reader: ARIA-labels on tree nodes, formula tooltip readable as `aria-describedby`
- Colour-blind safe: state pills use icon + colour (✓ active, ⏸ draft, ✗ obsolete)

---

## 7. xlsx Importer (RT2)

```ts
// prisma/import-routing-xlsx.ts
import * as XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'

const PRODUCTION_XLSX = 'document/Production-Std-Time-Cost-Machines.xlsx'
const ROUTING_XLSX    = 'document/process routing.xlsx'

async function main() {
  const prisma = new PrismaClient()

  // 1. Import work centers from `workcenter` sheet (4 unique WCs)
  // 2. Import work-center inputs from per-machine sheets in Production xlsx
  //    (computes labor_cost_per_min, electricity_cost_per_min, etc.)
  // 3. Import 19 formula parameters from `parameter` sheet
  // 4. Import 28 routing operations from `routing` sheet (templates)
  // 5. Import 923 activity templates from `activites` sheet
  // 6. Import 42 routing-op-activity links from `ro_op_act_me` sheet
  // 7. Validate: every formula_param referenced must exist
  // 8. Print summary report

  console.log(`Imported: ${wc} WCs, ${ops} ops, ${acts} activities, ${params} params`)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

Run as: `pnpm --filter backend tsx prisma/import-routing-xlsx.ts`

---

## 8. Cycle-Time Engine — design

### 8.1 Service signature

```ts
// backend/src/modules/routings/cycle-time.service.ts
@Injectable()
export class CycleTimeService {
  constructor(
    private prisma: PrismaService,
    private formula: FormulaService,
  ) {}

  async compute(productId: number, routingId?: number): Promise<RoutingCompute> {
    const product = await this.prisma.products.findUniqueOrThrow({
      where: { id: productId },
      include: { active_routing: { include: { activities: { include: { activity_template: { include: { formula_param: true, formula_param2: true } } } } } } }
    })
    const routing = product.active_routing!
    
    let totalMin = 0, totalCost = 0
    const opResults = []

    for (const op of routing.activities) {
      let opTotal = 0
      const actResults = []
      for (const stepAct of op.activities) {
        const tpl = stepAct.activity_template
        // Eval primary formula
        const m1 = this.formula.evaluate(
          tpl.formula_param.formula_expression,
          product.attributes
        )
        const stdM1 = stepAct.std_measure_override?.toNumber() ?? tpl.std_measure.toNumber()
        const ratio1 = Math.ceil(m1 / stdM1)
        const perMin = stepAct.per_minute_override?.toNumber() ?? tpl.per_minute.toNumber()
        let actMin = ratio1 * perMin

        // Eval secondary if present
        if (tpl.formula_param2) {
          const m2 = this.formula.evaluate(
            tpl.formula_param2.formula_expression,
            product.attributes
          )
          const stdM2 = tpl.std_measure2!.toNumber()
          const ratio2 = m2 / stdM2  // welding uses non-ceiled ratio
          actMin *= ratio2
        }

        // Apply WC efficiency
        const wcEff = tpl.workcenter.time_efficiency.toNumber() / 100
        actMin = actMin / wcEff

        actResults.push({ activityId: tpl.id, name: tpl.description, cycleTimeMin: actMin, trace: { m1, stdM1, ratio1, perMin } })
        opTotal += actMin
      }
      opResults.push({ opId: op.id, name: op.name, totalMin: opTotal, activities: actResults })
      totalMin += opTotal
    }

    // Cost rollup (called by StdCostService separately for clarity)
    return { productId, routingId: routing.id, totalMin, ops: opResults, computedAt: new Date() }
  }
}
```

### 8.2 FormulaService (safe eval)

```ts
import { Parser } from 'expr-eval'

@Injectable()
export class FormulaService {
  private parser = new Parser({
    operators: { add: true, subtract: true, multiply: true, divide: true,
                 power: true, factorial: false, comparison: false, logical: false,
                 in: false, assignment: false }
  })

  evaluate(expression: string, attrs: Record<string, any>): number {
    // Reject suspicious tokens (defence in depth)
    if (/__|process|require|import|eval|Function/.test(expression)) {
      throw new BadRequestException(`Invalid formula: ${expression}`)
    }
    try {
      const expr = this.parser.parse(expression)
      const variables = expr.variables({ withMembers: false })
      const ctx = Object.fromEntries(variables.map(v => [v, attrs[v] ?? 0]))
      return Number(expr.evaluate(ctx))
    } catch (e) {
      throw new BadRequestException(`Formula error: ${expression} (${e.message})`)
    }
  }
}
```

### 8.3 Cache invalidation

`product_bom`-style trigger:
```sql
CREATE OR REPLACE FUNCTION invalidate_routing_cache() RETURNS TRIGGER AS $$
BEGIN
  UPDATE mrp_routing_workcenter
     SET cache_key = NULL, last_computed_at = NULL
   WHERE product_id = NEW.id
     AND state = 'active';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invalidate_routing_on_product_attr_change
  AFTER UPDATE OF attributes ON products
  FOR EACH ROW
  WHEN (OLD.attributes IS DISTINCT FROM NEW.attributes)
  EXECUTE FUNCTION invalidate_routing_cache();
```

---

## 9. Acceptance Criteria (Sprint Demo)

✅ Demo script (15 min):

1. Open product `WH-CO-1` (column from 0X202 project) → **Routing tab visible**, status = "draft"
2. Click "Open Editor" → see 10 ops × ~6 activities each, each with cycle time computed
3. Hover ⓘ on activity → tooltip shows formula trace
4. Click "Recompute" → response < 500 ms, total time updates
5. Click "Activate" → status changes to active, mail_message logged
6. Open `/admin/workcenters` → see 4 WC cards with OEE gauges
7. Edit Built Up WC: drop performance from 95% → 80% → save → reopen WH-CO-1 → Recompute → total time increased
8. Open `/admin/activity-templates` → search "weld" → see 12 templates → click 1 → preview against {sumWeight: 2000, length: 12} → cycle time displayed
9. Verify `products.cost_production` is populated (DB query in Swagger)
10. Run E2E test: `npm test --testPathPattern=sprint4` → green

Non-functional:
- 80% test coverage on services (engine + formulas + std cost)
- Single product compute < 500 ms
- Project-wide compute job (1 sample project) < 60 s
- Lighthouse perf score ≥ 80 on RoutingEditor page

---

## 10. Risks (sprint-level)

| # | Risk | Likelihood | Mitigation |
|---|---|:-:|---|
| S1 | xlsx data inconsistency (e.g., `#VALUE!` in 4 sheets) blocks seed | M | Pre-process xlsx → CSV → validate before insert; default missing Labor Mix to {operator:100} |
| S2 | Formula engine evaluates user-provided expressions (admin only via API but still) | L | Whitelist via expr-eval + token scan; admin-only endpoint behind res_groups Sprint 1 RBAC |
| S3 | Recompute cascades when many products share a routing template | M | Cache invalidation only on product attr change (per-product) — template change = explicit "Recompute All" job |
| S4 | Engineers expect Gantt-style routing visualisation | L | Out of scope for Sprint 4; document as Sprint 7 |
| S5 | Sprint 3 BOM dependency may slip — bom_line FK not yet stable | L | bom_line.operation_id is nullable; doesn't block this sprint |

---

## 11. Hand-off to Claude Code

After this plan approval, **Claude Code** receives:

1. This file (`SPRINT_PLAN_ROUTING_STD_TIME.md`)
2. Companion: `GAP_ANALYSIS_ROUTING_STDTIME.md`
3. Existing code: `bdt-app/backend/`, `bdt-app/src/`, `bdt-app/document/*.xlsx`

**Claude Code's expected first actions:**
1. Re-validate the plan against current code (post-Sprint 3); flag any drift.
2. Generate detailed task graph (one task per RT1-RT21).
3. Begin D1 work (Dev A: RT1+RT4+RT5 skeleton; Dev B: RT13).
4. After each task: commit with message `[SP4-RT##] <story> — <DoD met>`.
5. End of each day: append CHANGELOG.md under `## [Sprint 4] — 2026-04-29` (in-progress section).
6. Sprint close: commit final, then call Notion connector to log report under user's team page.

**Notion log payload (template):**
```
Title: BDT Sprint 4 Closeout — Routing & Std Time
Body:
  - 80 h delivered / 80 h planned
  - 4 new tables, 21 stories, X tests, Y endpoints
  - Cycle Time Engine validated against MO sheet (deltas in compute-audit.md)
  - Demo recording: …
  - Known issues: (list R1-R7 from gap analysis if any unresolved)
  - Next sprint preview: …
```

---

*— end of Sprint 4 plan. Hand off to Claude Code for implementation.*
