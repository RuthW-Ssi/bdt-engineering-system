# Sprint 2 Implementation Plan — Product Layer (Standard + Custom)

> **Project:** BDT Engineer Management System
> **Sprint:** 2 (Product Foundation)
> **Length:** 5 working days, 2 devs (≈ 80 h capacity)
> **Date:** 2026-04-28
> **Architecture:** Monolith — extend existing `backend/` (NestJS 10 + Prisma 6 + PostgreSQL 16) and `src/` (React 19 + Vite)
>
> **🎯 Sprint Goal:** ระบบรองรับ **Product Layer** (Standard + Custom) ที่อยู่เหนือ Material Master (Sprint 1) ด้วย:
> - 2 product types (standard, custom) + dual identifier (`product_code` + `engineering_code` + `item_code`)
> - Project + project_zone (erection sequence) + 27 mark prefix master
> - 5-step approval workflow (Rev 7) สำหรับ NEW Standard registration
> - Promotion workflow (Custom → Standard) skeleton (Eng Mgr single approver)
> - Frontend: ProductList + 2 register modals (Standard / Custom)
>
> **Companion docs:**
> - [`STANDARD_VS_CUSTOM_PRODUCT.md`](./STANDARD_VS_CUSTOM_PRODUCT.md) — full design spec rev 5 (38 PDs)
> - [`PROMOTION_LIFECYCLE_DESIGN.md`](./PROMOTION_LIFECYCLE_DESIGN.md) — promotion deep dive
> - [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) — Odoo schema ADR
> - [`SPRINT_PLAN_MATERIAL_MASTER.md`](./SPRINT_PLAN_MATERIAL_MASTER.md) — Sprint 1 (completed)
>
> **As-is (Sprint 1 done):**
> ```
> backend/src/modules/
>   ├── identity/        — x-user-id stub
>   ├── master-data/     — uoms + product-categories
>   ├── materials/       — Material Master (10-char Part Code + 13 groups)
>   └── mail/            — mail_message audit
>
> src/
>   ├── api/             — axios client, materials.ts, master-data.ts
>   ├── pages/           — ProductList, ProductDetail, BomEditor, RoutingEditor
>   └── components/      — AppShell, status pills, badges
> ```

---

## 1. Sprint 2 Scope

### 1.1 In-scope (this sprint)

- ✅ Extend Prisma schema: `project`, `project_zone`, `products`, `product_variant`, `mark_prefix_master`, `tekla_prefix_mapping`, `promotion_request`, `project_product_cost`
- ✅ Seed: 27 mark prefixes, 21 Tekla mappings, 12 BDTOM standard product templates, HY370 grade, sample 0X202 project + zones
- ✅ NestJS modules: `projects`, `project-zones`, `products` (core), `mark-prefix-master`
- ✅ ProductCodeGenerator (STD-xxxxx / CUS-xxxxx) — separate from Material's 10-digit Part Code
- ✅ State machine: `draft → in_design → in_review → approved → released → obsolete`
- ✅ Validators: dual identifier rule, custom mark uniqueness, variant matrix, sale_ok/purchase_ok flags
- ✅ Frontend: ProductList page + 2 modals (NewStandardProduct, NewCustomProduct)
- ✅ Tests: unit ≥70% coverage on validators + state machine; 1 E2E happy path each type

### 1.2 Out-of-scope (deferred)

| Deferred to | Item |
|---|---|
| Sprint 3 | BOM module (mrp.bom + mrp.bom.line, lines reference `materials` from Sprint 1) |
| Sprint 3 | Drawings module (shop_drawing, drawing_revision) |
| Sprint 3 | Variant lazy-create on sales order (no sales module yet) |
| Sprint 4 | ECO module (`mrp.eco` pattern) — promotion_request schema scaffolded but full ECO link in Sprint 4 |
| Sprint 4 | Routings + work_centers |
| Sprint 5 | Tekla import adapter (4-file parser) |
| Sprint 5 | PR/PO/Stock integration; Odoo sync |
| Sprint 5 | Notification webhook (email + Teams via Power Automate) |
| Sprint 5–6 | Legacy Odoo data cleanup tool |
| Sprint 5–6 | Standard cost auto-recalc on raw material price change |
| Sprint 6+ | Promotion Similarity Engine (BDT-ANALYTICS-001) |
| Sprint 7+ | Site Erection App (mobile, as-built) |

---

## 2. Backlog (User Stories)

> **Tag legend:** 🟦 Standard (Odoo)  ·  🟨 Hybrid (extend)  ·  🟥 Custom (BDT-only)

### Epic A — Schema & Seed

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **P1** | 🟦 | Prisma migration: 8 new tables + columns added to existing | 6 h | `npx prisma migrate dev --name sprint2_product_layer`; all FKs + CHECK constraints applied; migration roll-back tested |
| **P2** | 🟦 | Seed: 27 mark_prefix_master, 21 tekla_prefix_mapping, HY370 grade, 12 BDTOM templates, 1 sample project (0X202) + 2 zones | 3 h | `npx ts-node prisma/seed.ts` populates all rows; idempotent (rerun-safe) |

### Epic B — Backend Modules

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **P3** | 🟨 | `ProjectsModule`: GET/POST/PATCH `/projects` + state machine (lead/won/in_design/in_fab/in_erection/handover/closed) | 6 h | Swagger schema; unit test state transitions |
| **P4** | 🟥 | `ProjectZonesModule`: CRUD `/projects/:id/zones` + erection_sequence reorder API | 4 h | unique zone code per project; sequence reorder atomic |
| **P5** | 🟦 | `ProductsModule` core: discriminator-aware service handling both standard + custom; CHECK constraints enforced via service-layer validators | 10 h | POST /products (standard), POST /products (custom); GET filter by `product_type`, `state`, `categ_id`, `project_id`, `q` |
| **P6** | 🟥 | `ProductCodeGenerator`: STD-xxxxx / CUS-xxxxx via `product_code_seq` table + `SELECT FOR UPDATE` (concurrency-safe) | 3 h | unit test 10 concurrent inserts → no duplicate codes |
| **P7** | 🟨 | Standard product validators: 4 cost components ≥0; if `sale_ok` OR `purchase_ok` → `item_code` required (10 chars); variant matrix structure | 4 h | DTO + zod + service-layer validator; 8 unit tests covering edge cases |
| **P8** | 🟥 | Custom product validators: project_id required, mark_prefix FK to master, mark_number unique within (project, zone), engineer_hours_est ≥0 | 4 h | UNIQUE constraint with COALESCE(zone, 0); 6 unit tests |
| **P9** | 🟦 | State machine: `draft → in_design → in_review → approved → released → obsolete`; reuse pattern from `materials.state-machine.ts` | 3 h | reuse `assertTransition` helper; 7 transition tests |
| **P10** | 🟦 | Mail audit: write `mail_message` on every create/update/state-change with tracking JSONB | 2 h | matches Sprint 1 pattern; reuse `MailMessageService` |

### Epic C — Frontend

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **P11** | 🟦 | API client: `src/api/products.ts`, `projects.ts`, `project-zones.ts`, `mark-prefix-master.ts` (axios + react-query, Odoo field naming) | 3 h | Typed wrappers + react-query hooks (useProducts, useProjects, ...) |
| **P12** | 🟦 | `ProductList` page: filter by `product_type` (tabs Standard/Custom), state, project — replace mock with real API | 4 h | URL params persist filter; pagination; loading/error/empty states |
| **P13** | 🟨 | `NewStandardProductModal`: form with categ, sale_ok/purchase_ok flags, 4 cost components, variant matrix definition, master_drawing_ref placeholder | 6 h | dynamic field show/hide; live `standard_cost_total` rollup; submit → POST /products |
| **P14** | 🟥 | `NewCustomProductModal`: project + zone select, mark_prefix dropdown (4-layer defense F15), mark_number, engineer_hours_est, attributes JSONB editor | 6 h | mark_prefix only from master (no free-text); live preview "{Zone}-{Prefix}-{Number}"; duplicate check via API |
| **P15** | 🟨 | `ProductDetail` page: tabs (Overview, Specs, Cost, Audit Log); show dual identifier (engineering_code, item_code, odoo_compliance_status) | 4 h | reuse Sprint 1 pattern; conditional sections per product_type |

### Epic D — Quality & Docs

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **P16** | 🟦 | Unit tests BE: ProductCodeGenerator + Validators + StateMachine ≥80% coverage | 3 h | `npm test --coverage` green |
| **P17** | 🟦 | E2E tests (supertest): happy path Standard + Custom + state submit_design | 2 h | both green |
| **P18** | 🟦 | Swagger docs at `/api/docs`; update CHANGELOG.md + README.md | 2 h | doc reviewed; matches API |

**Total estimate:** 6+3 + 6+4+10+3+4+4+3+2 + 3+4+6+6+4 + 3+2+2 = **75 h** + 5 h buffer = 80 h ✅

**Tag mix:** 🟦 ~50% / 🟨 ~25% / 🟥 ~25% — aligned with rev-5 architecture (Odoo-compatible base + steel-specific extensions)

---

## 3. Sprint Schedule (5 days × 2 devs)

| Day | Dev A (BE-heavy) | Dev B (FE + integration) |
|---|---|---|
| **Mon** | **P1** Prisma migration + **P2** seed (open PR for review) | Review schema; scaffold `src/api/products.ts` + react-query hooks (**P11**) |
| **Tue** | **P3** ProjectsModule + **P4** ProjectZonesModule | **P12** ProductList: tabs + filter + real API |
| **Wed** | **P5** ProductsModule core + **P6** ProductCodeGenerator | **P13** NewStandardProductModal (form + cost rollup) |
| **Thu** | **P7** Standard validators + **P8** Custom validators + **P9** state machine | **P14** NewCustomProductModal (mark prefix dropdown + zone select) |
| **Fri** | **P10** mail audit hooks + **P16** unit tests + **P17** E2E | **P15** ProductDetail + **P18** Swagger/docs/CHANGELOG + Demo prep |

**Daily ceremonies:**
- 09:30 Standup (15 min)
- 17:00 Async written update

**End of Sprint:**
- Fri 14:00 Sprint Review + Demo
- Fri 15:00 Retrospective

---

## 4. Schema Migration (P1)

### 4.1 New Tables

```prisma
// prisma/schema.prisma — APPEND to existing schema

// ── 🟦 Project ──────────────────────────────────────────────────
model project {
  id                Int        @id @default(autoincrement())
  project_code      String     @unique @db.VarChar(20)
  name              String     @db.VarChar(200)
  customer_id       Int?
  start_date        DateTime?  @db.Date
  target_handover   DateTime?  @db.Date
  state             String     @default("lead") @db.VarChar(20)
  active            Boolean    @default(true)
  odoo_ref_id       String?    @db.VarChar(40)
  create_uid        Int
  create_user       res_users  @relation("project_create", fields: [create_uid], references: [id])
  create_date       DateTime   @default(now()) @db.Timestamptz
  write_uid         Int
  write_user        res_users  @relation("project_write", fields: [write_uid], references: [id])
  write_date        DateTime   @default(now()) @db.Timestamptz

  zones             project_zone[]
  products          products[]
  project_costs     project_product_cost[]
}

// ── 🟥 Project Zone (erection sequence — F23 / PD-37) ──────────
model project_zone {
  id                       Int       @id @default(autoincrement())
  project_id               Int
  project                  project   @relation(fields: [project_id], references: [id])
  code                     String    @db.VarChar(20)        // 'WH', 'OF', 'A1'
  label                    String    @db.VarChar(80)
  zone_type                String    @db.VarChar(20)        // 'building'|'gridline'|'zone'|'mezzanine'
  erection_sequence        Int?
  target_erection_start    DateTime? @db.Date
  target_erection_end      DateTime? @db.Date
  crane_assignment         String?   @db.VarChar(60)
  notes                    String?   @db.Text
  active                   Boolean   @default(true)

  products                 products[]

  @@unique([project_id, code])
}

// ── 🟥 Mark Prefix Master (27 entries — F9 / PD-20) ────────────
model mark_prefix_master {
  code            String   @id @db.VarChar(10)    // 'C', 'SC', 'B', 'SB', 'P', 'RF', ...
  label           String   @db.VarChar(40)
  category        String   @db.VarChar(20)        // 'assembly'|'member'|'other'|'sub_component'|'plate_part'
  part_type_code  String   @db.Char(1)            // 'p'|'m'|'o'|'w'|'f'|'-'
  active          Boolean  @default(true)

  products        products[]
}

// ── 🟥 Tekla Prefix Mapping (F26 / PD-33) ──────────────────────
model tekla_prefix_mapping {
  tekla_type       String   @id @db.VarChar(10)
  bdt_mark_prefix  String   @db.VarChar(10)
  bdt_prefix       mark_prefix_master @relation(fields: [bdt_mark_prefix], references: [code])
  confidence       String   @db.VarChar(10)       // 'high'|'medium'|'low'
  source           String?  @db.VarChar(80)
  notes            String?  @db.Text
}

// ── 🟦/🟨/🟥 Products (single-table inheritance, F4 / PD-01) ───
model products {
  id                       Int       @id @default(autoincrement())
  product_code             String    @unique @db.VarChar(20)    // 'STD-00253', 'CUS-00873'
  engineering_code         String?   @unique @db.VarChar(20)    // 'BDTCM_001' (legacy ext catalog)
  item_code                String?   @unique @db.Char(10)       // Odoo Part Code 'BDTA000663'
  odoo_compliance_status   String    @default("NEW") @db.VarChar(20)  // MATCH|PARTIAL|NEW|NOT_FOUND
  name                     String    @db.VarChar(200)
  categ_id                 Int
  category                 product_category @relation(fields: [categ_id], references: [id])
  product_type             String    @db.VarChar(20)            // 'standard'|'custom'
  odoo_type                String    @default("product") @db.VarChar(10)  // 'product'|'consu'|'service'
  procure_method           String    @default("make_to_order") @db.VarChar(20)
  state                    String    @default("draft") @db.VarChar(20)
  active                   Boolean   @default(true)
  sale_ok                  Boolean   @default(false)
  purchase_ok              Boolean   @default(false)
  sales_price              Decimal   @default(1.0) @db.Decimal(12, 2)  // PD-22 read-only default

  // Cost components (4-component, 3 levels — F7)
  cost_raw_material        Decimal?  @db.Decimal(12, 2)
  cost_transport           Decimal?  @db.Decimal(12, 2)
  cost_production          Decimal?  @db.Decimal(12, 2)
  cost_warehouse           Decimal?  @db.Decimal(12, 2)
  // standard_cost_total = computed via DB GENERATED column (in raw SQL migration)

  // Standard-only fields
  master_drawing_id        Int?
  variant_attributes       Json?
  stock_policy             String?   @db.VarChar(20)
  reorder_min              Decimal?  @db.Decimal(12, 3)
  reorder_max              Decimal?  @db.Decimal(12, 3)

  // Custom-only fields
  project_id               Int?
  project                  project?  @relation(fields: [project_id], references: [id])
  erection_zone_id         Int?
  erection_zone            project_zone? @relation(fields: [erection_zone_id], references: [id])
  mark_prefix              String?   @db.VarChar(10)
  mark                     mark_prefix_master? @relation(fields: [mark_prefix], references: [code])
  mark_number              String?   @db.VarChar(20)
  shop_drawing_id          Int?
  revision                 String?   @db.VarChar(10)
  engineer_hours_est       Decimal?  @db.Decimal(8, 2)
  engineer_hours_act       Decimal?  @db.Decimal(8, 2)

  // Promotion lineage
  promoted_from_id         Int?
  promoted_from            products? @relation("Promotion", fields: [promoted_from_id], references: [id])
  promoted_descendants     products[] @relation("Promotion")
  promoted_date            DateTime? @db.Timestamptz
  legacy_codes             String[]                              // PG TEXT[]

  // Engineering attributes
  attributes               Json      @default("{}")              // {grade, height_h, width_b, web_tw, ...}

  // Odoo sync
  odoo_ref_id              String?   @db.VarChar(40)

  // Audit
  create_uid               Int
  create_user              res_users @relation("product_create", fields: [create_uid], references: [id])
  create_date              DateTime  @default(now()) @db.Timestamptz
  write_uid                Int
  write_user               res_users @relation("product_write", fields: [write_uid], references: [id])
  write_date               DateTime  @default(now()) @db.Timestamptz

  variants                 product_variant[]
  promotion_requests_src   promotion_request[] @relation("source_custom")
  promotion_requests_tgt   promotion_request[] @relation("target_standard")
  project_costs            project_product_cost[]
  messages                 mail_message_product[]
}

// ── 🟨 Product Variant (lazy-create — PD-10) ────────────────────
model product_variant {
  id                  Int      @id @default(autoincrement())
  parent_product_id   Int
  parent              products @relation(fields: [parent_product_id], references: [id])
  variant_code        String   @unique @db.VarChar(40)
  attribute_values    Json
  cost_extra          Decimal  @default(0) @db.Decimal(12, 2)
  active              Boolean  @default(true)
}

// ── 🟥 Project Product Cost (per-project actuals) ────────────────
model project_product_cost {
  id                       Int       @id @default(autoincrement())
  product_id               Int
  product                  products  @relation(fields: [product_id], references: [id])
  project_id               Int
  project                  project   @relation(fields: [project_id], references: [id])
  cost_raw_material        Decimal?  @db.Decimal(12, 2)
  cost_transport           Decimal?  @db.Decimal(12, 2)
  cost_production          Decimal?  @db.Decimal(12, 2)
  cost_warehouse           Decimal?  @db.Decimal(12, 2)
  variance_vs_standard     Decimal?  @db.Decimal(8, 4)
  snapshotted_at           DateTime  @default(now()) @db.Timestamptz

  @@unique([product_id, project_id])
}

// ── 🟥 Promotion Request (skeleton — full workflow Sprint 4) ────
model promotion_request {
  id                            Int       @id @default(autoincrement())
  source_custom_product_id      Int
  source                        products  @relation("source_custom", fields: [source_custom_product_id], references: [id])
  target_standard_product_id    Int?
  target                        products? @relation("target_standard", fields: [target_standard_product_id], references: [id])
  requestor_id                  Int
  state                         String    @default("draft") @db.VarChar(20)
  promotion_mode                String?   @db.VarChar(20)        // 'identity'|'generalized'|'sourcing_only'
  reason                        String?   @db.Text
  reuse_evidence_count          Int?
  similar_product_ids           Int[]
  proposed_variant_matrix       Json?
  proposed_standard_cost        Json?
  proposed_sale_ok              Boolean?
  proposed_purchase_ok          Boolean?
  cost_reviewer_id              Int?
  cost_reviewed_at              DateTime? @db.Timestamptz
  approver_id                   Int?
  approved_at                   DateTime? @db.Timestamptz
  done_at                       DateTime? @db.Timestamptz
  rejection_reason              String?   @db.Text
  create_date                   DateTime  @default(now()) @db.Timestamptz
}

// ── Bridge mail_message ↔ products (model='product') ────────────
// Reuse Sprint 1 mail_message; relation bridge through res_id+model
// (no dedicated model needed — service queries WHERE model='product')
// Add disambiguator: define explicit Prisma relation if needed
model mail_message_product {
  // Optional: only if you want strict typing. Otherwise use mail_message generic.
  // Skip if reusing mail_message via service-layer query.
}

// ── 🟦 Steel Grade master (for HY370 + others — PD-36) ──────────
model steel_grade {
  code         String   @id @db.VarChar(20)        // 'SS400', 'SM490', 'HY370'
  standard     String?  @db.VarChar(20)            // 'JIS G3101', 'JIS G3106'
  yield_mpa    Decimal? @db.Decimal(6, 1)
  tensile_mpa  Decimal? @db.Decimal(6, 1)
  notes        String?  @db.Text
  active       Boolean  @default(true)
}
```

### 4.2 Raw SQL — CHECK constraints + computed columns + counter

```sql
-- prisma/migrations/sprint2_product_layer/migration.sql — append after Prisma generate

-- Computed standard_cost_total (rolled up from 4 components)
ALTER TABLE "products"
  ADD COLUMN "standard_cost_total" NUMERIC(12,2)
  GENERATED ALWAYS AS (
    COALESCE(cost_raw_material,0) + COALESCE(cost_transport,0)
    + COALESCE(cost_production,0) + COALESCE(cost_warehouse,0)
  ) STORED;

ALTER TABLE "project_product_cost"
  ADD COLUMN "cost_total" NUMERIC(12,2)
  GENERATED ALWAYS AS (
    COALESCE(cost_raw_material,0) + COALESCE(cost_transport,0)
    + COALESCE(cost_production,0) + COALESCE(cost_warehouse,0)
  ) STORED;

-- product_code_seq counter (concurrency-safe — F4 PD-02)
CREATE TABLE "product_code_seq" (
  "kind"     CHAR(3) PRIMARY KEY,    -- 'STD' or 'CUS'
  "next_run" INT NOT NULL DEFAULT 1
);
INSERT INTO "product_code_seq"(kind, next_run) VALUES ('STD', 1), ('CUS', 1);

-- CHECK: product_type fields (PD-28)
ALTER TABLE "products" ADD CONSTRAINT "chk_product_type_fields" CHECK (
  (product_type = 'standard'
    AND project_id IS NULL AND erection_zone_id IS NULL
    AND mark_prefix IS NULL AND mark_number IS NULL
    AND promoted_from_id IS DISTINCT FROM id)  -- can be promoted FROM custom
  OR
  (product_type = 'custom'
    AND project_id IS NOT NULL AND mark_prefix IS NOT NULL AND mark_number IS NOT NULL
    AND master_drawing_id IS NULL AND promoted_from_id IS NULL)
);

-- CHECK: product_code prefix matches type
ALTER TABLE "products" ADD CONSTRAINT "chk_product_code_prefix" CHECK (
  (product_type = 'standard' AND product_code LIKE 'STD-%')
  OR (product_type = 'custom' AND product_code LIKE 'CUS-%')
);

-- CHECK: item_code required when commercial (PD-28)
ALTER TABLE "products" ADD CONSTRAINT "chk_item_code_required" CHECK (
  product_type = 'custom'                       -- Custom never has item_code
  OR (sale_ok = false AND purchase_ok = false)  -- Standard non-commercial OK
  OR item_code IS NOT NULL                       -- Standard commercial must have
);

-- CHECK: item_code = exactly 10 chars when present
ALTER TABLE "products" ADD CONSTRAINT "chk_item_code_length" CHECK (
  item_code IS NULL OR LENGTH(item_code) = 10
);

-- UNIQUE: custom mark within (project, zone)
CREATE UNIQUE INDEX "idx_custom_mark_per_project_zone"
  ON "products"(project_id, COALESCE(erection_zone_id, 0), mark_prefix, mark_number)
  WHERE product_type = 'custom';

-- UNIQUE partial: legacy_codes GIN
CREATE INDEX "idx_products_legacy" ON "products" USING GIN (legacy_codes);

-- Trigger: prevent mark_prefix/number change after release (PD-23 F15 layer 4)
CREATE OR REPLACE FUNCTION prevent_mark_change_after_release()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state IN ('released','obsolete')
     AND (OLD.mark_prefix IS DISTINCT FROM NEW.mark_prefix
          OR OLD.mark_number IS DISTINCT FROM NEW.mark_number) THEN
    RAISE EXCEPTION 'mark_prefix/number cannot change after release (state=%)', OLD.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_mark_immutable"
  BEFORE UPDATE ON "products"
  FOR EACH ROW EXECUTE FUNCTION prevent_mark_change_after_release();

-- Indexes for query performance
CREATE INDEX "idx_products_categ"     ON "products"(categ_id);
CREATE INDEX "idx_products_state"     ON "products"(state) WHERE active;
CREATE INDEX "idx_products_project"   ON "products"(project_id) WHERE product_type = 'custom';
CREATE INDEX "idx_products_attr_gin"  ON "products" USING GIN (attributes);
CREATE INDEX "idx_products_promoted"  ON "products"(promoted_from_id) WHERE promoted_from_id IS NOT NULL;
```

### 4.3 Migration command

```bash
cd backend
npx prisma migrate dev --name sprint2_product_layer
# Then run the raw SQL block above as a follow-up migration:
npx prisma db execute --file prisma/migrations/sprint2_product_layer/manual.sql
npx prisma generate
npx ts-node prisma/seed.ts
```

---

## 5. Seed Data (P2)

### 5.1 mark_prefix_master (27 entries — from `document/Product Engineer.xlsx` Sheet "Engineer")

```ts
// prisma/seed.ts — append
const MARK_PREFIXES = [
  // Assembly (p)
  { code: 'C',     label: 'Column',          category: 'assembly',     part_type_code: 'p' },
  { code: 'SC',    label: 'Sub Column',      category: 'assembly',     part_type_code: 'p' },
  { code: 'P',     label: 'Post',            category: 'assembly',     part_type_code: 'p' },
  { code: 'RF',    label: 'Rafter',          category: 'assembly',     part_type_code: 'p' },
  { code: 'B',     label: 'Beam',            category: 'assembly',     part_type_code: 'p' },
  { code: 'SB',    label: 'Sub Beam',        category: 'assembly',     part_type_code: 'p' },
  { code: 'CA',    label: 'Canopy',          category: 'assembly',     part_type_code: 'p' },
  { code: 'FR',    label: 'Frame',           category: 'assembly',     part_type_code: 'p' },
  { code: 'LP',    label: 'Lose Plate',      category: 'assembly',     part_type_code: 'p' },
  // Member (m)
  { code: 'PS',    label: 'Pipe Stud',       category: 'member',       part_type_code: 'm' },
  { code: 'VB',    label: 'Vertical Brace',  category: 'member',       part_type_code: 'm' },
  { code: 'HB',    label: 'Horizontal Brace',category: 'member',       part_type_code: 'm' },
  { code: 'ST',    label: 'Stair',           category: 'member',       part_type_code: 'm' },
  { code: 'R',     label: 'Rod',             category: 'member',       part_type_code: 'm' },
  { code: 'PU',    label: 'Purlin',          category: 'member',       part_type_code: 'm' },
  { code: 'GR',    label: 'Girt',            category: 'member',       part_type_code: 'm' },
  { code: 'SG',    label: 'Support Gutter',  category: 'member',       part_type_code: 'm' },
  { code: 'GU',    label: 'Gutter',          category: 'member',       part_type_code: 'm' },
  { code: 'MZ',    label: 'Mezzanine',       category: 'member',       part_type_code: 'm' },  // PD-30 rev-3
  // Other (o)
  { code: 'FB',    label: 'Fly Brace',       category: 'other',        part_type_code: 'o' },
  { code: 'ANGLE', label: 'Angle',           category: 'other',        part_type_code: 'o' },
  // Sub-component (w/f)
  { code: 'WEB',   label: 'Web',             category: 'sub_component',part_type_code: 'w' },
  { code: 'FLG',   label: 'Flange',          category: 'sub_component',part_type_code: 'f' },
  // Plate parts (p)
  { code: 'END',    label: 'End Plate',      category: 'plate_part',   part_type_code: 'p' },
  { code: 'GUSSET', label: 'Gusset Plate',   category: 'plate_part',   part_type_code: 'p' },
  { code: 'RIB',    label: 'Rib Plate',      category: 'plate_part',   part_type_code: 'p' },
  { code: 'STIFF',  label: 'Stiff Plate',    category: 'plate_part',   part_type_code: 'p' },
  // Truss (-)
  { code: 'TR',     label: 'Truss',          category: 'assembly',     part_type_code: '-' },
];

await prisma.mark_prefix_master.createMany({ data: MARK_PREFIXES, skipDuplicates: true });
```

### 5.2 tekla_prefix_mapping (21 initial entries — F26)

```ts
const TEKLA_MAPPINGS = [
  { tekla_type: 'CO',  bdt_mark_prefix: 'C',     confidence: 'high',   source: '0X202 actual' },
  { tekla_type: 'BE',  bdt_mark_prefix: 'B',     confidence: 'medium', source: 'inferred' },
  { tekla_type: 'SBE', bdt_mark_prefix: 'SB',    confidence: 'medium', source: 'inferred' },
  { tekla_type: 'RA',  bdt_mark_prefix: 'RF',    confidence: 'medium', source: 'inferred' },
  { tekla_type: 'TR',  bdt_mark_prefix: 'TR',    confidence: 'high',   source: 'direct' },
  { tekla_type: 'FB',  bdt_mark_prefix: 'FB',    confidence: 'high',   source: '0X202 actual' },
  { tekla_type: 'VB',  bdt_mark_prefix: 'VB',    confidence: 'high',   source: 'direct' },
  { tekla_type: 'HB',  bdt_mark_prefix: 'HB',    confidence: 'high',   source: 'direct' },
  { tekla_type: 'PU',  bdt_mark_prefix: 'PU',    confidence: 'high',   source: 'direct' },
  { tekla_type: 'GR',  bdt_mark_prefix: 'GR',    confidence: 'high',   source: 'direct' },
  { tekla_type: 'PO',  bdt_mark_prefix: 'P',     confidence: 'medium', source: 'inferred' },
  { tekla_type: 'MZ',  bdt_mark_prefix: 'MZ',    confidence: 'high',   source: 'rev-3 Q3' },
  { tekla_type: 'CN',  bdt_mark_prefix: 'CA',    confidence: 'low',    source: 'inferred' },
  { tekla_type: 'FR',  bdt_mark_prefix: 'FR',    confidence: 'high',   source: 'direct' },
  { tekla_type: 'ST',  bdt_mark_prefix: 'ST',    confidence: 'high',   source: 'direct' },
  { tekla_type: 'w',   bdt_mark_prefix: 'WEB',   confidence: 'high',   source: '0X202 actual' },
  { tekla_type: 'f',   bdt_mark_prefix: 'FLG',   confidence: 'high',   source: '0X202 actual' },
  { tekla_type: 'EP',  bdt_mark_prefix: 'END',   confidence: 'medium', source: 'inferred' },
  { tekla_type: 'GP',  bdt_mark_prefix: 'GUSSET',confidence: 'medium', source: 'inferred' },
  { tekla_type: 'RP',  bdt_mark_prefix: 'RIB',   confidence: 'medium', source: 'inferred' },
  { tekla_type: 'SP',  bdt_mark_prefix: 'STIFF', confidence: 'medium', source: 'inferred' },
];

await prisma.tekla_prefix_mapping.createMany({ data: TEKLA_MAPPINGS, skipDuplicates: true });
```

### 5.3 steel_grade master (key grades + HY370 — PD-36)

```ts
const STEEL_GRADES = [
  { code: 'SS400',  standard: 'JIS G3101', yield_mpa: 245, tensile_mpa: 400, notes: 'General structural' },
  { code: 'SM490',  standard: 'JIS G3106', yield_mpa: 325, tensile_mpa: 490 },
  { code: 'SM520',  standard: 'JIS G3106', yield_mpa: 355, tensile_mpa: 520 },
  { code: 'SM570',  standard: 'JIS G3106', yield_mpa: 450, tensile_mpa: 570 },
  { code: 'A36',    standard: 'ASTM A36',  yield_mpa: 250, tensile_mpa: 400, notes: 'US structural' },
  { code: 'G550',   standard: 'AS 1397',   yield_mpa: 550, tensile_mpa: 550, notes: 'Coldform galvanized' },
  { code: 'HY370',  standard: 'JIS G3106', yield_mpa: 365, tensile_mpa: 490, notes: 'SM490YB equivalent — common in Standard Part HY370 series' },
];

await prisma.steel_grade.createMany({ data: STEEL_GRADES, skipDuplicates: true });
```

### 5.4 12 BDTOM Standard Product Templates (F14)

```ts
const STANDARD_TEMPLATES = [
  { product_code: 'STD-00001', engineering_code: 'BDTOM01000', name: 'CANOPY',           categ_id: /* lookup MAIN_STRUCTURES */, ... },
  { product_code: 'STD-00002', engineering_code: 'BDTOM02000', name: 'BEAM',             ... },
  { product_code: 'STD-00003', engineering_code: 'BDTOM03000', name: 'COLUMN',           ... },
  { product_code: 'STD-00004', engineering_code: 'BDTOM04000', name: 'RAFTER',           ... },
  { product_code: 'STD-00005', engineering_code: 'BDTOM05000', name: 'RAFTERTRUSS',      ... },
  { product_code: 'STD-00006', engineering_code: 'BDTOM06000', name: 'TRANSFERTRUSS',    ... },
  { product_code: 'STD-00007', engineering_code: 'BDTOM07000', name: 'TRANSFERBEAM',     ... },
  { product_code: 'STD-00008', engineering_code: 'BDTOM08000', name: 'CONNECTIONPLATE',  ... },
  { product_code: 'STD-00009', engineering_code: 'BDTOM09000', name: 'SUBTRUSS',         ... },
  { product_code: 'STD-00010', engineering_code: 'BDTOM10000', name: 'POST',             ... },
  { product_code: 'STD-00011', engineering_code: 'BDTOM11000', name: 'MEZZANINE',        ... },
  { product_code: 'STD-00012', engineering_code: 'BDTH000667', name: 'Steel Structure',  ... },
];
// product_type='standard', state='draft', sale_ok=false, purchase_ok=false (will be configured later)
```

### 5.5 Sample project 0X202 (warehouse Samut Prakan — for E2E test)

```ts
const proj = await prisma.project.create({
  data: {
    project_code: '0X202',
    name: 'Warehouse Samut Prakan (WH-CO1-FACTORY)',
    state: 'in_design',
    create_uid: 1, write_uid: 1,
  },
});

await prisma.project_zone.createMany({ data: [
  { project_id: proj.id, code: 'WH', label: 'Warehouse Building', zone_type: 'building', erection_sequence: 1 },
  { project_id: proj.id, code: 'OF', label: 'Office Building',    zone_type: 'building', erection_sequence: 2 },
]});
```

### 5.6 product_category — extend Sprint 1's 13 → 20

Update Sprint 1 seed in same migration: add 7 missing groups (Paint, Part Components, Services/Construction, /Transport, /Fabrication, Maintenance, Measurement Tools, Stationary, Safety) as documented in §3.5.2.

---

## 6. NestJS Module Structure (Epic B)

```
backend/src/modules/
├── identity/                     [ Sprint 1 — exists ]
├── master-data/                  [ Sprint 1 — exists ]
├── materials/                    [ Sprint 1 — exists ]
├── mail/                         [ Sprint 1 — exists ]
│
├── projects/                     [ NEW — P3 ]
│   ├── dto/
│   │   ├── create-project.dto.ts
│   │   ├── update-project.dto.ts
│   │   └── query-project.dto.ts
│   ├── projects.controller.ts
│   ├── projects.service.ts
│   ├── projects.state-machine.ts
│   └── projects.module.ts
│
├── project-zones/                [ NEW — P4 ]
│   ├── dto/
│   ├── project-zones.controller.ts    # nested route /projects/:id/zones
│   ├── project-zones.service.ts
│   └── project-zones.module.ts
│
├── mark-prefix-master/           [ NEW — read-only catalog ]
│   ├── mark-prefix.controller.ts      # GET /mark-prefixes (used by FE dropdown)
│   ├── mark-prefix.service.ts
│   └── mark-prefix.module.ts
│
└── products/                     [ NEW — P5/6/7/8/9/10 ]
    ├── dto/
    │   ├── create-standard-product.dto.ts
    │   ├── create-custom-product.dto.ts
    │   ├── update-product.dto.ts
    │   ├── query-product.dto.ts
    │   └── product-action.dto.ts
    ├── validators/
    │   ├── product-type.validator.ts        # CHECK constraint enforcement at service layer
    │   ├── standard-product.validator.ts    # 4 cost ≥0, item_code rule
    │   └── custom-product.validator.ts      # mark uniqueness, project FK
    ├── product-code.generator.ts            # STD-xxxxx / CUS-xxxxx via SELECT FOR UPDATE
    ├── products.state-machine.ts
    ├── products.controller.ts
    ├── products.service.ts
    └── products.module.ts
```

### 6.1 ProductCodeGenerator skeleton (P6)

```ts
// backend/src/modules/products/product-code.generator.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type ProductKind = 'STD' | 'CUS'

@Injectable()
export class ProductCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(kind: ProductKind): Promise<string> {
    // Concurrency-safe via SELECT FOR UPDATE inside transaction
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<{ next_run: number }[]>`
        SELECT next_run FROM product_code_seq
        WHERE kind = ${kind}
        FOR UPDATE
      `
      const next = seq[0].next_run
      await tx.$executeRaw`
        UPDATE product_code_seq SET next_run = ${next + 1}
        WHERE kind = ${kind}
      `
      return `${kind}-${next.toString().padStart(5, '0')}`
    })
  }
}
```

### 6.2 State Machine (P9 — reuse pattern from `materials.state-machine.ts`)

```ts
// backend/src/modules/products/products.state-machine.ts
import { UnprocessableEntityException } from '@nestjs/common'

export type ProductState =
  | 'draft' | 'in_design' | 'in_review' | 'approved'
  | 'released' | 'obsolete'

const TRANSITIONS: Record<string, ProductState[]> = {
  draft:      ['in_design', 'obsolete'],
  in_design:  ['in_review', 'draft'],
  in_review:  ['approved', 'in_design'],
  approved:   ['released', 'in_design'],
  released:   ['obsolete'],         // ECO required for changes — Sprint 4
  obsolete:   [],
}

export function assertProductTransition(from: string, to: ProductState) {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityException(
      `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(', ') || '(none — terminal)'}`,
    )
  }
}

export const PRODUCT_ACTIONS: Record<string, ProductState> = {
  action_submit_design:  'in_design',
  action_submit_review:  'in_review',
  action_approve:        'approved',
  action_release:        'released',
  action_obsolete:       'obsolete',
  action_reset:          'draft',
}
```

---

## 7. API Contracts (Swagger)

```http
# ── Projects ──
POST   /api/v1/projects                       Body: CreateProjectDto
GET    /api/v1/projects                       Query: state, q, page, limit
GET    /api/v1/projects/:project_code
PATCH  /api/v1/projects/:project_code

# ── Project Zones ──
GET    /api/v1/projects/:id/zones
POST   /api/v1/projects/:id/zones             Body: CreateZoneDto
PATCH  /api/v1/projects/:id/zones/:zone_id
PATCH  /api/v1/projects/:id/zones/reorder     Body: { sequence: [zone_id, ...] }

# ── Mark Prefix Master (read-only for dropdown) ──
GET    /api/v1/mark-prefixes                  Query: category, active

# ── Products ──
POST   /api/v1/products                       Body: CreateStandardProductDto | CreateCustomProductDto (discriminator: product_type)
GET    /api/v1/products                       Query: product_type, state, categ_id, project_id, q, page, limit
GET    /api/v1/products/:product_code
PATCH  /api/v1/products/:product_code

# State actions
POST   /api/v1/products/:product_code/action_submit_design
POST   /api/v1/products/:product_code/action_submit_review
POST   /api/v1/products/:product_code/action_approve
POST   /api/v1/products/:product_code/action_release
POST   /api/v1/products/:product_code/action_obsolete

# Audit
GET    /api/v1/products/:product_code/messages

# Health (existing Sprint 1)
GET    /api/v1/healthz
GET    /api/v1/readyz
GET    /api/docs                              # Swagger UI
```

### 7.1 DTO examples

```ts
// create-standard-product.dto.ts
export class CreateStandardProductDto {
  @IsIn(['standard']) product_type: 'standard'
  @IsOptional() @IsIn(['product','consu','service']) odoo_type?: string
  @IsString() @Length(1, 200) name: string
  @IsOptional() @IsString() @Length(1, 20) engineering_code?: string  // BDTCM_xxx legacy
  @IsOptional() @Matches(/^[A-Z0-9]{10}$/) item_code?: string         // 10-char Odoo
  @IsInt() categ_id: number
  @IsBoolean() sale_ok: boolean
  @IsBoolean() purchase_ok: boolean
  @IsOptional() @IsNumber() cost_raw_material?: number
  @IsOptional() @IsNumber() cost_transport?: number
  @IsOptional() @IsNumber() cost_production?: number
  @IsOptional() @IsNumber() cost_warehouse?: number
  @IsOptional() @IsObject() variant_attributes?: Record<string, unknown>
  @IsOptional() @IsIn(['min_max','as_needed']) stock_policy?: string
  @IsOptional() @IsNumber() reorder_min?: number
  @IsOptional() @IsNumber() reorder_max?: number
}

// create-custom-product.dto.ts
export class CreateCustomProductDto {
  @IsIn(['custom']) product_type: 'custom'
  @IsString() @Length(1, 200) name: string
  @IsInt() categ_id: number
  @IsInt() project_id: number
  @IsOptional() @IsInt() erection_zone_id?: number
  @IsString() @Length(1, 10) mark_prefix: string         // FK → mark_prefix_master
  @IsString() @Length(1, 20) mark_number: string
  @IsOptional() @IsNumber() engineer_hours_est?: number
  @IsOptional() @IsObject() attributes?: Record<string, unknown>
}
```

---

## 8. Frontend Architecture (Epic C)

```
src/
├── api/
│   ├── client.ts                 [ exists ]
│   ├── materials.ts              [ exists ]
│   ├── master-data.ts            [ exists ]
│   ├── products.ts               [ NEW — P11 ]
│   ├── projects.ts               [ NEW — P11 ]
│   ├── project-zones.ts          [ NEW — P11 ]
│   ├── mark-prefix-master.ts     [ NEW — P11 ]
│   └── types.ts                  [ extend with Product, Project, Zone types ]
├── hooks/
│   ├── useMaterials.ts           [ exists ]
│   ├── useProducts.ts            [ NEW — useStandardProducts, useCustomProducts ]
│   ├── useProjects.ts            [ NEW ]
│   ├── useProjectZones.ts        [ NEW ]
│   └── useMarkPrefixes.ts        [ NEW ]
├── pages/
│   ├── ProductList.tsx           [ EXTEND P12 — add type tabs + project filter ]
│   ├── ProductDetail.tsx         [ EXTEND P15 — show dual identifier, type-specific tabs ]
│   ├── BomEditor.tsx             [ exists ]
│   ├── BomDiffReview.tsx         [ exists ]
│   ├── RoutingEditor.tsx         [ exists ]
│   └── RoutingList.tsx           [ exists ]
├── components/
│   ├── product/                  [ NEW folder ]
│   │   ├── NewStandardProductModal.tsx        [ P13 ]
│   │   ├── NewCustomProductModal.tsx          [ P14 ]
│   │   ├── MarkPrefixDropdown.tsx             [ 4-layer defense — F15 layer 1+2 ]
│   │   ├── CostComponentInput.tsx             [ 4-component cost editor ]
│   │   ├── VariantMatrixEditor.tsx            [ Standard product variant config ]
│   │   └── ProductTypeBadge.tsx
│   └── ui/                       [ exists ]
└── types/index.ts                [ extend with new types ]
```

---

## 9. Test Strategy (Epic D)

### 9.1 Unit tests (P16)

- `product-code.generator.spec.ts` — concurrency: 10 parallel calls → 10 unique codes
- `standard-product.validator.spec.ts` — 8 cases (cost ≥0, item_code required when commercial, variant matrix)
- `custom-product.validator.spec.ts` — 6 cases (project FK, mark_prefix FK, mark uniqueness within zone)
- `products.state-machine.spec.ts` — 7 transition cases (valid + invalid)
- `product-type.validator.spec.ts` — discriminator field rules (standard vs custom nullability)

### 9.2 E2E (P17)

```
test/e2e/products.e2e-spec.ts
  - test: 'create standard → submit_design → in_review → approved → released'
  - test: 'create custom under project 0X202 zone WH → mark prefix C number 1 → unique check'
  - test: 'standard with sale_ok=true but missing item_code → 422'
  - test: 'duplicate mark in same zone → 409'
```

### 9.3 Acceptance Criteria (Sprint Demo)

| # | Scenario | Expected |
|---|---|---|
| AC-1 | Create Standard "Cee Purlin C-200" with sale_ok=true + item_code='BDTC000123' | 201 STD-xxxxx, state=draft |
| AC-2 | Create Standard with sale_ok=true but no item_code | 422 chk_item_code_required |
| AC-3 | Create Standard with item_code 9 chars | 422 chk_item_code_length |
| AC-4 | Create Custom mark "C-1" in project 0X202 zone WH | 201 CUS-xxxxx, displays "WH-C-1" |
| AC-5 | Create another Custom same mark "C-1" same zone | 409 unique violation |
| AC-6 | Create Custom same mark "C-1" different zone OF | 201 success (zone disambiguates) |
| AC-7 | Custom with mark_prefix "XX" (not in master) | 422 FK violation |
| AC-8 | Released custom → try update mark_number | DB trigger raises exception |
| AC-9 | GET /products?product_type=standard&q=BEAM | returns matching only |
| AC-10 | GET /products/:code/messages | audit trail with create + state changes |
| AC-11 | 10 concurrent POST /products (5 STD + 5 CUS) | all unique product_codes |
| AC-12 | UI: NewCustomProductModal — mark_prefix dropdown shows 27 options with category groups | renders correctly |
| AC-13 | UI: ProductList tabs Standard/Custom; URL params persist filter on refresh | filter persists |

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Schema migration breaks existing materials data | Low | High | Add new tables only; column additions to existing nullable; test rollback in dev |
| `chk_product_type_fields` CHECK too strict | Medium | Medium | Service-layer pre-validate with friendly error; review constraints with QA |
| product_code_seq lock contention | Low | Low | Same pattern as Sprint 1 `part_code_seq`; tested + works |
| Mark prefix dropdown UX (27 options) too long | Medium | Low | Categorize by group + autocomplete; same pattern as material category picker |
| 4-component cost UI confusing | Medium | Medium | Show live `standard_cost_total` rollup; tooltip per component |
| Variant matrix combinatorial explosion | Medium | Medium | Lazy-create — UI allows definition only, instantiation deferred to sales (Sprint 5) |
| HY370 grade — no actual yield/tensile values confirmed | Low | Low | Use SM490YB equivalent; flag for stakeholder confirm before Sprint 2 close |
| Promotion request schema scaffolded but workflow incomplete | High | Low | OK — full workflow in Sprint 4; schema reserved to avoid future migration |
| Frontend pnpm + react-query v5 upgrade compat | Low | Low | already used in Sprint 1; no version bump required |

---

## 11. Definition of Done (Sprint 2)

### Backend
- [x] Prisma migration `sprint2_product_layer` applied successfully + roll-back tested
- [x] All seeds populated (27 prefixes, 21 mappings, 7 grades, 12 templates, 1 sample project)
- [x] All endpoints listed in §7 functional with Swagger schema
- [x] Unit tests ≥80% coverage on validators + generators + state machine
- [x] E2E happy path tests passing
- [x] mail_message audit row written on every create/update/state-change
- [x] All CHECK constraints + UNIQUE indexes + triggers from §4.2 active

### Frontend
- [x] ProductList page with tabs (Standard/Custom) + filters fetching real API
- [x] NewStandardProductModal + NewCustomProductModal functional
- [x] ProductDetail page showing dual identifier + audit log
- [x] Mark prefix dropdown with 4-layer defense (F15)
- [x] Live cost rollup in Standard form
- [x] Loading/error/empty states; toast on success/error

### Quality
- [x] CHANGELOG.md updated with Sprint 2 entries
- [x] README.md updated with new endpoint list
- [x] Swagger UI shows all endpoints with examples
- [x] No `console.log` in production code
- [x] ESLint + Prettier clean

### Demo Script (Friday 14:00)
1. Show Prisma schema diff — 8 new tables
2. Run seed → demonstrate 27 prefixes + sample project loaded
3. Create Standard "Cee Purlin C-200" via UI (sale_ok=true + item_code) → see STD-00013 generated
4. Create Custom "WH-C-1" under project 0X202 → see CUS-00001 generated
5. Try duplicate mark in same zone → 409 error toast
6. Submit standard for design review → state transitions logged in audit
7. Show Swagger API docs
8. Show test coverage report ≥80%

---

## 12. Open Questions for Stakeholders (before kickoff Monday)

> ✅ All major design questions resolved through rev-1 to rev-5 (38 PD decisions). These are minor implementation details:

1. **product_category seed for new groups (8-20):** confirm Thai/EN labels + parent_id + account_id mapping
2. **HY370 properties:** confirm yield 365 / tensile 490 (or different per BDT spec)?
3. **engineering_code optional vs required:** for new Standard products created from scratch (not promoted), should `engineering_code` default to NULL or auto-generate "BDT-{uuid}" pattern?
4. **Project 0X202 sample data:** create real project entry for E2E or use placeholder?
5. **Run Number 5-digit assignment:** Sprint 2 scope — Standard product `item_code` set manually by Engineer (full 10 chars); BSC workflow for Run Number assignment is **deferred to Sprint 4–5** (Rev 7 5-step workflow). OK?

---

## 13. Sprint 3+ Preview

| Sprint | Theme | Highlight |
|---|---|---|
| 3 | BOM + Drawings | mrp.bom + bom_line referencing materials; shop_drawing + revisions; 2-level BOM tested with 0X202 example |
| 4 | ECO + Routings | mrp_eco state machine; routing + work_centers; full promotion workflow (4 paths: draft → cost_review → final_approval → done + Rev 7 bridge) |
| 5 | CAD + ERP integrations | Tekla 4-file import adapter; PR/PO/Stock connectors; notification webhook (email + Teams Power Automate); Odoo XML-RPC sync |
| 6 | Reporting + Cleanup | Material aging; legacy data cleanup tool (Thai→EN, prefix migration); standard cost auto-recalc |
| 7+ | Site App + Microservices | Mobile erection sequence app; as-built feedback; conditional microservice extraction |

---

## 14. References

- [`STANDARD_VS_CUSTOM_PRODUCT.md`](./STANDARD_VS_CUSTOM_PRODUCT.md) §3.5–§3.9, §5, §6, §13 (rev 5)
- [`PROMOTION_LIFECYCLE_DESIGN.md`](./PROMOTION_LIFECYCLE_DESIGN.md) §1–§4 (F1–F15 + 3-mode BOM model)
- [`SPRINT_PLAN_MATERIAL_MASTER.md`](./SPRINT_PLAN_MATERIAL_MASTER.md) (Sprint 1 patterns to reuse)
- [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) (Odoo schema ADR)
- `document/Product Engineer.xlsx` Sheet "Engineer" (mark prefix dictionary)
- `document/odoo-product-template.xlsx` (real Odoo data — 2,688 records)
- `document/Standard Part - Standardized.xlsx` (32 standardized parts — F19)
- `document/0X202 อาคารคลังสินค้า/*` (real Tekla output — 4 file types)
- `document/คู่มือการจัดการวัสดุ_Rev7_28-04-2026.pdf` (authoritative business process)

---

*Prepared by: BDT Engineering — Sprint 2 Implementation Plan v1.0 (2026-04-28)*
*Aligned with: STANDARD_VS_CUSTOM_PRODUCT.md rev 5 (38 Product Decisions)*
