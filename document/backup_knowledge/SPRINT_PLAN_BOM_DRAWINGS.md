# Sprint 3 Implementation Plan — BOM + Drawings

> **Project:** BDT Engineer Management System
> **Sprint:** 3 (BOM + Drawings)
> **Length:** 5 working days, 2 devs (≈ 80 h capacity)
> **Date:** 2026-04-29 (planning) — kickoff after Sprint 2 lands
> **Architecture:** Monolith — extend existing `backend/` + `src/` (Sprint 2 products)
>
> **🎯 Sprint Goal:** ระบบรองรับ **BOM (multi-level + 3-view foundation)** และ **Shop Drawing (revision lifecycle + file storage)** สำหรับ Standard และ Custom products
>
> **Companion docs:**
> - [`STANDARD_VS_CUSTOM_PRODUCT.md`](./STANDARD_VS_CUSTOM_PRODUCT.md) §5 ERD + §6 workflow
> - [`PROMOTION_LIFECYCLE_DESIGN.md`](./PROMOTION_LIFECYCLE_DESIGN.md) F10b 3-Mode BOM Model
> - [`SPRINT_PLAN_PRODUCT.md`](./SPRINT_PLAN_PRODUCT.md) — Sprint 2 contract (consume products schema)
>
> **Prerequisite:** Sprint 2 `products` table + `materials` table (Sprint 1) must exist
>
> **As-is after Sprint 2:**
> ```
> backend/src/modules/
>   ├── identity/, master-data/, materials/, mail/    [ Sprint 1 ]
>   ├── projects/, project-zones/                      [ Sprint 2 ]
>   ├── mark-prefix-master/                            [ Sprint 2 ]
>   └── products/                                      [ Sprint 2 ]
>
> src/
>   ├── pages/ProductList.tsx, ProductDetail.tsx       [ Sprint 1+2 ]
>   ├── pages/BomEditor.tsx, BomDiffReview.tsx         [ Sprint 1 mock — Sprint 3 wires real ]
>   └── components/product/*                           [ Sprint 2 ]
> ```

---

## 1. Sprint 3 Scope

### 1.1 In-scope

- ✅ **BOM module** — `product_bom` + `bom_line` schema + versioning + state machine + explosion service
- ✅ **Multi-level BOM** — `bom_line.material_id` (raw) OR `bom_line.sub_product_id` (sub-assembly) — validated by 0X202 example
- ✅ **3-BOM foundation** — `bom_view` + `owner_role` columns (full 3-BOM workflow Sprint 4 with promotion)
- ✅ **Drawings module** — `shop_drawing` + `drawing_revision` schema + state machine + revision sequence A→B→C→IFC→AB
- ✅ **File storage** — local filesystem with abstraction layer (S3/MinIO swap-in Sprint 5)
- ✅ **BOM Editor extension** — multi-level tree UI + activate + version diff
- ✅ **Drawing viewer + revision list** — file metadata + download URL
- ✅ Wire Sprint 2 `products.master_drawing_id` and `products.shop_drawing_id` FKs to actual `shop_drawing` records

### 1.2 Out-of-scope (deferred)

| Deferred to | Item |
|---|---|
| Sprint 4 | ECO module (`mrp.eco`) — BOM/drawing change after release; **CHECK constraint added now to require ECO when modifying released BOM/drawing** |
| Sprint 4 | Routings + work_centers |
| Sprint 4 | Promotion full workflow (uses BOM cloning logic from Sprint 3) |
| Sprint 4 | mBOM (production-side) full implementation |
| Sprint 4 | sBOM (sales-side) kit/packaging definition |
| Sprint 5 | S3/MinIO file storage swap-in (interface ready in Sprint 3) |
| Sprint 5 | Tekla 4-file import adapter (creates BOM hierarchy + Drawings) |
| Sprint 5 | Drawing diff viewer (compare revision A vs B) |
| Sprint 6 | Drawing retention policy enforcement (7-year auto-archive) |
| Sprint 6 | BOM cost rollup (compute total cost from line items) |

### 1.3 Out-of-band integrations (parallel)

- **Sprint 2 in-flight:** Schema for `products.master_drawing_id` and `products.shop_drawing_id` already nullable INT in Sprint 2. Sprint 3 **adds FK constraint** + populates real data.

---

## 2. Backlog (User Stories)

> **Tag legend:** 🟦 Standard (Odoo)  ·  🟨 Hybrid (extend)  ·  🟥 Custom (BDT-only)

### Epic A — Schema & Storage (8 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **BD1** | 🟦 | Prisma migration: 4 new tables (`product_bom`, `bom_line`, `shop_drawing`, `drawing_revision`) + 2 FK constraints (`products.master_drawing_id`, `products.shop_drawing_id`) | 6 h | migrate dev success; FKs from Sprint 2 nullable INT now hard FK; CHECK constraints applied; rollback tested |
| **BD2** | 🟥 | Seed: sample BOMs from `0X202 อาคารคลังสินค้า/` (1 Column WH-CO-1 with 3 sub-parts WEB/web1/flange1) + 1 sample Standard product BOM (Cee Purlin) | 2 h | `prisma/seed.ts` populates; idempotent; matches real Tekla output structure |

### Epic B — BOM Module (24 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **BD3** | 🟦 | `BomsModule` core: GET/POST/PATCH `/products/:code/boms` + state machine (`draft → active → obsolete`) | 8 h | Swagger schema; only 1 `state=active` per product (DB constraint); state transitions logged in `mail_message` |
| **BD4** | 🟥 | BOM line types: `material_id` (raw → Sprint 1) **XOR** `sub_product_id` (Sprint 2 product) — exactly one set | 4 h | DB CHECK constraint; service-layer validator; 4 unit tests |
| **BD5** | 🟦 | BOM Explosion service: flatten multi-level BOM + scrap percentage rollup → cutting list | 6 h | `GET /boms/:id/explode` returns flat list; recursion handles 3+ levels; circular-ref detector throws |
| **BD6** | 🟨 | `bom_view` + `owner_role` columns (eBOM/mBOM/sBOM foundation) — only `eBOM` writable in Sprint 3, others reserved | 3 h | enum CHECK constraint; default `eBOM` + `engineering`; full views Sprint 4 |
| **BD7** | 🟦 | Mail audit hooks for BOM create/update/state-change | 3 h | reuses Sprint 1 `MailMessageService`; tracking JSONB on every change |

### Epic C — Drawings Module (16 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **BD8** | 🟥 | `DrawingsModule` core: GET/POST/PATCH `/drawings` + nested `/drawings/:id/revisions` | 8 h | drawing_type=`master`\|`project`; cad_source enum (`tekla`\|`autocad`\|`advance`\|`other`); revision sequence A→B→C→IFC→AB validation |
| **BD9** | 🟦 | Drawing state machine: `draft → in_review → approved → released → superseded \| obsolete` | 4 h | reuse pattern from `materials.state-machine.ts`; 8 transition unit tests |
| **BD10** | 🟥 | File storage abstraction: local filesystem driver (S3/MinIO swap-in Sprint 5); presigned URL stub | 4 h | `FileStorageService` interface; `LocalDriver` impl; `getUploadUrl` + `getDownloadUrl` returns absolute URL; max file 50 MB |

### Epic D — Frontend (16 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **BD11** | 🟨 | Extend `BomEditor.tsx` (existing mock) → real API: multi-level tree + add/remove lines + drag-drop reorder + scrap % editor | 8 h | uses `useBom(productCode)` hook; expand/collapse levels; persists changes via PATCH |
| **BD12** | 🟦 | BOM activate UI: button on draft BOM + version diff vs previous active (reuse `BomDiffReview.tsx`) | 4 h | confirm dialog; optimistic update; Mermaid-style diff visualization |
| **BD13** | 🟥 | Drawing viewer panel in `ProductDetail.tsx` — shows revisions list + current revision badge + file download | 4 h | revision list ordered by sequence; current revision highlighted; click → opens file URL |

### Epic E — Quality & Docs (8 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **BD14** | 🟦 | Unit tests BE: BomService (versioning, line type CHECK, explosion, scrap calc) + DrawingService (state machine, revision sequence) ≥80% coverage | 4 h | `npm test --coverage` green |
| **BD15** | 🟦 | E2E tests (supertest): (a) Standard product → BOM v1 → activate → released; (b) Custom product → drawing rev A → submit_review → approved → released | 2 h | both green |
| **BD16** | 🟦 | Swagger docs + CHANGELOG.md + README.md updated | 2 h | doc reviewed; matches API |

**Total estimate:** 8 + 24 + 16 + 16 + 8 = **72 h** + 8 h buffer = 80 h ✅

**Tag mix:** 🟦 ~50% / 🟨 ~15% / 🟥 ~35% — heavier custom because Drawings is steel-domain specific (Odoo doesn't have first-class shop_drawing entity)

---

## 3. Sprint Schedule (5 days × 2 devs)

| Day | Dev A (BE-heavy) | Dev B (FE + integration) |
|---|---|---|
| **Mon** | **BD1** Prisma migration + **BD2** seed | Review schema; scaffold `src/api/boms.ts` + `drawings.ts` (react-query hooks) |
| **Tue** | **BD3** BomsModule core + **BD4** line type CHECK | **BD11 part 1** BomEditor refactor: replace mock with real API |
| **Wed** | **BD5** BOM Explosion service + **BD6** bom_view foundation + **BD7** audit | **BD11 part 2** BomEditor: drag-drop + scrap editor |
| **Thu** | **BD8** DrawingsModule core + **BD9** state machine | **BD12** BOM activate UI + **BD13** Drawing viewer panel |
| **Fri** | **BD10** File storage abstraction + **BD14** unit tests + **BD15** E2E | **BD13** Drawing upload + **BD16** Swagger/docs/CHANGELOG + Demo prep |

**Daily ceremonies:** 09:30 standup; 17:00 async update

**End of Sprint:** Friday 14:00 Demo + 15:00 Retrospective

---

## 4. Schema Migration (BD1)

### 4.1 New Tables

```prisma
// prisma/schema.prisma — APPEND to Sprint 2 schema

// ── 🟦 BOM (mrp.bom pattern) ────────────────────────────────────
model product_bom {
  id                       Int       @id @default(autoincrement())
  product_id               Int
  product                  products  @relation(fields: [product_id], references: [id])
  version                  String    @db.VarChar(20)        // '1.0.0', '2.0.0'
  bom_view                 String    @default("eBOM") @db.VarChar(10)   // 'eBOM'|'mBOM'|'sBOM' (PD-29 / F10b)
  owner_role               String    @default("engineering") @db.VarChar(20)
  state                    String    @default("draft") @db.VarChar(20) // draft|active|obsolete
  product_qty              Decimal   @default(1.0) @db.Decimal(12, 3)
  product_uom_id           Int
  product_uom              uom_uom   @relation("bom_uom", fields: [product_uom_id], references: [id])
  bom_type                 String    @default("normal") @db.VarChar(20) // normal|phantom|kit
  effective_from           DateTime? @db.Date
  effective_to             DateTime? @db.Date
  cloned_from_bom_id       Int?      // for promotion Mode B (full Sprint 4)
  cloned_from              product_bom?  @relation("BomLineage", fields: [cloned_from_bom_id], references: [id])
  cloned_descendants       product_bom[] @relation("BomLineage")
  eco_id                   Int?      // FK to mrp_eco — Sprint 4
  notes                    String?   @db.Text
  odoo_ref_id              String?   @db.VarChar(40)

  create_uid               Int
  create_user              res_users @relation("bom_create", fields: [create_uid], references: [id])
  create_date              DateTime  @default(now()) @db.Timestamptz
  write_uid                Int
  write_user               res_users @relation("bom_write", fields: [write_uid], references: [id])
  write_date               DateTime  @default(now()) @db.Timestamptz

  lines                    bom_line[]
}

// ── 🟦 BOM Line (mrp.bom.line pattern + steel extension) ────────
model bom_line {
  id                       Int       @id @default(autoincrement())
  bom_id                   Int
  bom                      product_bom  @relation(fields: [bom_id], references: [id], onDelete: Cascade)
  sequence                 Int                                    // ordering
  // EXACTLY ONE of these two must be set (CHECK constraint)
  material_id              Int?      // → Sprint 1 materials (raw stock)
  material                 materials? @relation(fields: [material_id], references: [id])
  sub_product_id           Int?      // → Sprint 2 products (sub-assembly for multi-level)
  sub_product              products?  @relation("SubProductInBom", fields: [sub_product_id], references: [id])
  product_qty              Decimal   @db.Decimal(12, 3)
  product_uom_id           Int
  product_uom              uom_uom   @relation("bom_line_uom", fields: [product_uom_id], references: [id])
  scrap_pct                Decimal   @default(0) @db.Decimal(6, 2)  // e.g., 3.5 = 3.5%
  attribute_value_ids      Json?     // for variant-specific lines (Sprint 4+)
  // Steel-specific
  cutting_length_mm        Decimal?  @db.Decimal(10, 1)              // override for cut-to-length parts
  weight_per_unit_kg       Decimal?  @db.Decimal(10, 3)              // computed or manual
  note                     String?
}

// ── 🟥 Shop Drawing (steel-domain custom — not in Odoo) ─────────
model shop_drawing {
  id                       Int       @id @default(autoincrement())
  drawing_number           String    @unique @db.VarChar(40)        // 'DWG-MASTER-CP200', 'DWG-PRJ007-B1'
  drawing_type             String    @db.VarChar(10)                // 'master'|'project'
  product_id               Int                                       // FK to Sprint 2 products (master OR project drawing)
  product                  products  @relation("ProductDrawings", fields: [product_id], references: [id])
  project_id               Int?                                      // null for master drawings
  project                  project?  @relation("ProjectDrawings", fields: [project_id], references: [id])
  current_revision         String?   @db.VarChar(5)                  // 'A', 'B', 'IFC', 'AB' — denormalized for query
  state                    String    @default("draft") @db.VarChar(20)  // draft|in_review|approved|released|superseded|obsolete
  cad_source               String    @default("other") @db.VarChar(20)  // tekla|autocad|advance|other
  generalized_from_id      Int?                                      // for promotion Mode B
  generalized_from         shop_drawing? @relation("DrawingLineage", fields: [generalized_from_id], references: [id])
  generalized_descendants  shop_drawing[] @relation("DrawingLineage")
  retention_until          DateTime? @db.Date                        // 7 years from release per AISC (PD-21)
  odoo_ref_id              String?   @db.VarChar(40)

  create_uid               Int
  create_user              res_users @relation("drawing_create", fields: [create_uid], references: [id])
  create_date              DateTime  @default(now()) @db.Timestamptz
  write_uid                Int
  write_user               res_users @relation("drawing_write", fields: [write_uid], references: [id])
  write_date               DateTime  @default(now()) @db.Timestamptz

  revisions                drawing_revision[]
}

// ── 🟥 Drawing Revision (revision sequence A→B→C→IFC→AB) ────────
model drawing_revision {
  id                       Int       @id @default(autoincrement())
  drawing_id               Int
  drawing                  shop_drawing @relation(fields: [drawing_id], references: [id], onDelete: Cascade)
  revision                 String    @db.VarChar(5)                  // 'A','B','C','IFC','AB' or '0','1','2',...
  sequence                 Int                                       // numeric for ordering: 1=A, 2=B, 99=IFC, 100=AB
  change_summary           String?   @db.Text
  file_url                 String    @db.VarChar(500)                // local: /storage/drawings/abc.pdf; S3: s3://bucket/drawings/abc.pdf
  file_size_bytes          BigInt?
  file_mime_type           String?   @db.VarChar(60)
  file_checksum_sha256     String?   @db.VarChar(64)
  approved_uid             Int?
  approver                 res_users? @relation("DrawingApprover", fields: [approved_uid], references: [id])
  approved_date            DateTime? @db.Timestamptz
  is_current               Boolean   @default(false)                  // exactly one true per drawing (DB constraint)

  create_uid               Int
  create_user              res_users @relation("revision_create", fields: [create_uid], references: [id])
  create_date              DateTime  @default(now()) @db.Timestamptz
}
```

### 4.2 Raw SQL — CHECK constraints + triggers

```sql
-- prisma/migrations/sprint3_bom_drawings/manual.sql

-- BOM line: exactly one of material_id or sub_product_id (XOR)
ALTER TABLE "bom_line" ADD CONSTRAINT "chk_bom_line_xor" CHECK (
  (material_id IS NOT NULL AND sub_product_id IS NULL)
  OR (material_id IS NULL AND sub_product_id IS NOT NULL)
);

-- BOM: only 1 active BOM per product per bom_view
CREATE UNIQUE INDEX "idx_bom_one_active_per_view"
  ON "product_bom"(product_id, bom_view)
  WHERE state = 'active';

-- BOM lifecycle: prevent direct UPDATE of state without going through API
-- (state machine enforced at service layer; DB rejects state change while sub_state set elsewhere)

-- BOM: bom_view enum
ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_view"
  CHECK (bom_view IN ('eBOM','mBOM','sBOM'));

-- BOM: owner_role enum  
ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_owner_role"
  CHECK (owner_role IN ('engineering','production','supply_chain'));

-- BOM: state enum
ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_state"
  CHECK (state IN ('draft','active','obsolete'));

-- BOM: bom_type enum
ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_type"
  CHECK (bom_type IN ('normal','phantom','kit'));

-- Drawing: drawing_type enum
ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_drawing_type"
  CHECK (drawing_type IN ('master','project'));

-- Drawing: cad_source enum
ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_cad_source"
  CHECK (cad_source IN ('tekla','autocad','advance','other'));

-- Drawing: state enum
ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_drawing_state"
  CHECK (state IN ('draft','in_review','approved','released','superseded','obsolete'));

-- Drawing: master drawing has no project_id; project drawing has project_id
ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_drawing_type_project" CHECK (
  (drawing_type = 'master' AND project_id IS NULL)
  OR (drawing_type = 'project' AND project_id IS NOT NULL)
);

-- Revision: only one is_current=true per drawing
CREATE UNIQUE INDEX "idx_drawing_one_current_revision"
  ON "drawing_revision"(drawing_id)
  WHERE is_current = true;

-- Revision: unique within drawing
CREATE UNIQUE INDEX "idx_drawing_revision_unique"
  ON "drawing_revision"(drawing_id, revision);

-- Drawing: file_size cap 50 MB
ALTER TABLE "drawing_revision" ADD CONSTRAINT "chk_file_size_max"
  CHECK (file_size_bytes IS NULL OR file_size_bytes <= 52428800);

-- Activate Sprint 2 dormant FKs
ALTER TABLE "products"
  ADD CONSTRAINT "fk_products_master_drawing"
  FOREIGN KEY ("master_drawing_id") REFERENCES "shop_drawing"("id") ON DELETE SET NULL;

ALTER TABLE "products"
  ADD CONSTRAINT "fk_products_shop_drawing"
  FOREIGN KEY ("shop_drawing_id") REFERENCES "shop_drawing"("id") ON DELETE SET NULL;

-- Indexes
CREATE INDEX "idx_bom_product"          ON "product_bom"(product_id);
CREATE INDEX "idx_bom_state"            ON "product_bom"(state) WHERE state IN ('draft','active');
CREATE INDEX "idx_bom_line_bom"         ON "bom_line"(bom_id);
CREATE INDEX "idx_bom_line_material"    ON "bom_line"(material_id) WHERE material_id IS NOT NULL;
CREATE INDEX "idx_bom_line_sub_product" ON "bom_line"(sub_product_id) WHERE sub_product_id IS NOT NULL;
CREATE INDEX "idx_drawing_product"      ON "shop_drawing"(product_id);
CREATE INDEX "idx_drawing_project"      ON "shop_drawing"(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX "idx_drawing_state"        ON "shop_drawing"(state) WHERE state != 'obsolete';
CREATE INDEX "idx_revision_drawing"     ON "drawing_revision"(drawing_id);

-- Trigger: auto-set retention_until when state → released
CREATE OR REPLACE FUNCTION set_retention_on_release()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.state = 'released' AND OLD.state != 'released' THEN
    NEW.retention_until := CURRENT_DATE + INTERVAL '7 years';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_drawing_retention"
  BEFORE UPDATE ON "shop_drawing"
  FOR EACH ROW EXECUTE FUNCTION set_retention_on_release();

-- Trigger: prevent BOM line modification when bom.state = 'active' or 'obsolete'
-- (must go through ECO — Sprint 4)
CREATE OR REPLACE FUNCTION prevent_bom_line_change_on_active_bom()
RETURNS TRIGGER AS $$
DECLARE
  bom_state VARCHAR(20);
BEGIN
  SELECT state INTO bom_state FROM product_bom
    WHERE id = COALESCE(NEW.bom_id, OLD.bom_id);
  IF bom_state IN ('active','obsolete') THEN
    RAISE EXCEPTION 'Cannot modify lines of % BOM (state=%); requires ECO (Sprint 4)',
      TG_OP, bom_state;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_bom_line_immutable_after_active"
  BEFORE INSERT OR UPDATE OR DELETE ON "bom_line"
  FOR EACH ROW EXECUTE FUNCTION prevent_bom_line_change_on_active_bom();
```

### 4.3 Migration command

```bash
cd backend
npx prisma migrate dev --name sprint3_bom_drawings
npx prisma db execute --file prisma/migrations/sprint3_bom_drawings/manual.sql
npx prisma generate
npx ts-node prisma/seed.ts
```

---

## 5. Seed Data (BD2)

### 5.1 Sample BOM from 0X202 (matches real Tekla output)

```ts
// prisma/seed.ts — append after Sprint 2 seed

// Lookup Sprint 2 product STD-00003 (COLUMN template) and CUS-00001 (WH-CO-1)
const wpc1 = await prisma.products.findUnique({ where: { product_code: 'CUS-00001' } });

// Create eBOM for Custom product WH-CO-1 (Column WH-CO-1 from 0X202)
const bom = await prisma.product_bom.create({
  data: {
    product_id: wpc1.id,
    version: '1.0.0',
    bom_view: 'eBOM',
    owner_role: 'engineering',
    state: 'draft',
    product_qty: 1.0,
    product_uom_id: /* lookup 'EA' */,
    bom_type: 'normal',
    notes: 'Imported from 0X202R1 Tekla — WH-CO-1 Column 454 kg',
    create_uid: 1, write_uid: 1,
  }
});

// Lookup raw materials (Sprint 1 materials catalog)
const pl6x850 = await prisma.materials.findFirst({ where: { description_sale: { contains: 'PL6X850' } } });
const pl8x175 = await prisma.materials.findFirst({ where: { description_sale: { contains: 'PL8X175' } } });

// BOM lines (3 lines — matches real Assembly Part List structure)
// 1 web plate + 2 flange plates (separate rows so multi-level / sequence
// reorder UX (BD11) has real data to play with)
await prisma.bom_line.createMany({ data: [
  { bom_id: bom.id, sequence: 1, material_id: pl6x850?.id, product_qty: 1, product_uom_id: 1, scrap_pct: 3.0, weight_per_unit_kg: 228.18, cutting_length_mm: 8428, note: 'WH-w1 — web plate' },
  { bom_id: bom.id, sequence: 2, material_id: pl8x175?.id, product_qty: 1, product_uom_id: 1, scrap_pct: 3.0, weight_per_unit_kg: 92.62, cutting_length_mm: 8427, note: 'WH-f1 — top flange plate' },
  { bom_id: bom.id, sequence: 3, material_id: pl8x175?.id, product_qty: 1, product_uom_id: 1, scrap_pct: 3.0, weight_per_unit_kg: 92.62, cutting_length_mm: 8427, note: 'WH-f2 — bottom flange plate' },
]});

// Note: a 4th option for richer testing — replace one flange row with a sub_product_id
// pointing to a separately-modeled "WEB sub-product" (Sprint 4 promotion will need this).
// Sprint 3 keeps it flat-3-lines so BomEditor reorder UX has data without depending on
// sub-product BOMs that don't exist yet.

// Sample shop drawing for WH-CO-1
const drawing = await prisma.shop_drawing.create({
  data: {
    drawing_number: 'DWG-0X202R1-WH-CO-1',
    drawing_type: 'project',
    product_id: wpc1.id,
    project_id: wpc1.project_id,
    state: 'draft',
    cad_source: 'tekla',
    create_uid: 1, write_uid: 1,
  }
});

// Initial revision A
await prisma.drawing_revision.create({
  data: {
    drawing_id: drawing.id,
    revision: 'A',
    sequence: 1,
    change_summary: 'First issue to client (sample data)',
    file_url: '/storage/drawings/sample-WH-CO-1-revA.pdf',
    file_size_bytes: 1234567,
    file_mime_type: 'application/pdf',
    is_current: true,
    create_uid: 1,
  }
});

// Wire back to product
await prisma.products.update({
  where: { id: wpc1.id },
  data: { shop_drawing_id: drawing.id, revision: 'A' }
});

// Sample Standard product BOM (Cee Purlin C-200)
// ... similar pattern with master_drawing_id wired
```

---

## 6. NestJS Module Structure (Epic B + C)

```
backend/src/modules/
├── identity/, master-data/, materials/, mail/        [ Sprint 1 ]
├── projects/, project-zones/, mark-prefix-master/    [ Sprint 2 ]
├── products/                                         [ Sprint 2 ]
│
├── boms/                            [ NEW — Sprint 3 ]
│   ├── dto/
│   │   ├── create-bom.dto.ts
│   │   ├── update-bom.dto.ts
│   │   ├── add-bom-line.dto.ts       (with XOR validator)
│   │   └── query-bom.dto.ts
│   ├── validators/
│   │   ├── bom-line-xor.validator.ts (material_id XOR sub_product_id)
│   │   └── bom-state.validator.ts
│   ├── services/
│   │   ├── boms.service.ts           (CRUD + state machine)
│   │   ├── bom-explosion.service.ts  (multi-level traversal + scrap rollup)
│   │   └── bom-versioning.service.ts (clone for new version)
│   ├── boms.controller.ts            (/products/:code/boms + /boms/:id/*)
│   ├── boms.state-machine.ts
│   └── boms.module.ts
│
├── drawings/                        [ NEW — Sprint 3 ]
│   ├── dto/
│   │   ├── create-drawing.dto.ts
│   │   ├── add-revision.dto.ts
│   │   └── query-drawing.dto.ts
│   ├── validators/
│   │   ├── revision-sequence.validator.ts  (A → B → C → IFC → AB ordering)
│   │   └── drawing-type.validator.ts       (master no project_id; project requires)
│   ├── services/
│   │   ├── drawings.service.ts
│   │   └── revisions.service.ts
│   ├── drawings.controller.ts
│   ├── revisions.controller.ts             (nested /drawings/:id/revisions)
│   ├── drawings.state-machine.ts
│   └── drawings.module.ts
│
└── file-storage/                    [ NEW — Sprint 3 ]
    ├── interfaces/
    │   └── file-storage.interface.ts       (getUploadUrl, getDownloadUrl, delete, getMetadata)
    ├── drivers/
    │   ├── local.driver.ts                 (Sprint 3 default: writes to ./storage/)
    │   └── s3.driver.ts                    (Sprint 5: stub interface)
    ├── file-storage.service.ts             (factory: picks driver from env)
    └── file-storage.module.ts
```

### 6.1 BomExplosionService skeleton (BD5)

```ts
// backend/src/modules/boms/services/bom-explosion.service.ts
import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

interface ExplodedLine {
  level: number
  bom_id: number
  line_id: number
  ref_type: 'material' | 'sub_product'
  ref_id: number
  ref_code: string
  ref_name: string
  product_qty: number              // accumulated through levels
  scrap_pct: number                // accumulated through levels
  effective_qty: number            // qty × (1 + scrap%)
  weight_per_unit_kg?: number
  total_weight_kg?: number
}

@Injectable()
export class BomExplosionService {
  constructor(private prisma: PrismaService) {}

  async explode(bomId: number, parentQty = 1.0, parentScrapPct = 0, level = 0, visited = new Set<number>()): Promise<ExplodedLine[]> {
    if (visited.has(bomId)) {
      throw new BadRequestException(`Circular BOM reference detected at bom_id=${bomId}`)
    }
    visited.add(bomId)

    if (level > 10) {
      throw new BadRequestException('BOM depth exceeded 10 levels — possible mis-modeled hierarchy')
    }

    const lines = await this.prisma.bom_line.findMany({
      where: { bom_id: bomId },
      include: { material: true, sub_product: true },
      orderBy: { sequence: 'asc' },
    })

    const result: ExplodedLine[] = []

    for (const line of lines) {
      const accQty = parentQty * Number(line.product_qty)
      const accScrap = parentScrapPct + Number(line.scrap_pct)
      const effQty = accQty * (1 + accScrap / 100)

      if (line.material_id) {
        // Raw material — leaf node
        result.push({
          level,
          bom_id: bomId,
          line_id: line.id,
          ref_type: 'material',
          ref_id: line.material_id,
          ref_code: line.material!.default_code,
          ref_name: line.material!.name,
          product_qty: accQty,
          scrap_pct: accScrap,
          effective_qty: effQty,
          weight_per_unit_kg: line.weight_per_unit_kg ? Number(line.weight_per_unit_kg) : undefined,
          total_weight_kg: line.weight_per_unit_kg ? Number(line.weight_per_unit_kg) * effQty : undefined,
        })
      } else if (line.sub_product_id) {
        // Sub-assembly — recurse into its active BOM
        const subBom = await this.prisma.product_bom.findFirst({
          where: { product_id: line.sub_product_id, state: 'active', bom_view: 'eBOM' }
        })
        if (!subBom) {
          // No active BOM yet — treat as leaf with sub_product reference
          result.push({
            level,
            bom_id: bomId,
            line_id: line.id,
            ref_type: 'sub_product',
            ref_id: line.sub_product_id,
            ref_code: line.sub_product!.product_code,
            ref_name: line.sub_product!.name,
            product_qty: accQty,
            scrap_pct: accScrap,
            effective_qty: effQty,
          })
        } else {
          const subLines = await this.explode(subBom.id, effQty, 0, level + 1, new Set(visited))
          result.push(...subLines)
        }
      }
    }

    return result
  }

  /**
   * Aggregate flat list by ref to produce cutting list / shopping list
   */
  async aggregate(exploded: ExplodedLine[]) {
    const byRef = new Map<string, ExplodedLine>()
    for (const line of exploded) {
      const key = `${line.ref_type}:${line.ref_id}`
      const existing = byRef.get(key)
      if (existing) {
        existing.effective_qty += line.effective_qty
        if (line.total_weight_kg && existing.total_weight_kg) {
          existing.total_weight_kg += line.total_weight_kg
        }
      } else {
        byRef.set(key, { ...line })
      }
    }
    return Array.from(byRef.values())
  }
}
```

### 6.2 State Machines

```ts
// boms.state-machine.ts
export type BomState = 'draft' | 'active' | 'obsolete'

const BOM_TRANSITIONS: Record<string, BomState[]> = {
  draft:    ['active', 'obsolete'],
  active:   ['obsolete'],
  obsolete: [],
}

// drawings.state-machine.ts
export type DrawingState = 'draft' | 'in_review' | 'approved' | 'released' | 'superseded' | 'obsolete'

const DRAWING_TRANSITIONS: Record<string, DrawingState[]> = {
  draft:      ['in_review', 'obsolete'],
  in_review:  ['approved', 'draft'],
  approved:   ['released', 'in_review'],
  released:   ['superseded', 'obsolete'],
  superseded: [],          // terminal — superseded by new revision
  obsolete:   [],
}

export const DRAWING_ACTIONS: Record<string, DrawingState> = {
  action_submit_review: 'in_review',
  action_approve:       'approved',
  action_reject:        'draft',
  action_release:       'released',
  action_supersede:     'superseded',
  action_obsolete:      'obsolete',
}
```

### 6.3 File Storage Interface (BD10)

```ts
// file-storage/interfaces/file-storage.interface.ts
export interface FileStorageDriver {
  /** Returns presigned upload URL valid for 15 min. Sprint 3: returns local POST endpoint. */
  getUploadUrl(key: string, contentType: string): Promise<{ url: string; method: 'PUT' | 'POST'; fields?: Record<string,string> }>
  
  /** Returns download URL (public for local; presigned 1hr for S3). */
  getDownloadUrl(key: string): Promise<string>
  
  /** Get metadata: size, content-type, last-modified */
  getMetadata(key: string): Promise<{ size: number; contentType: string; checksumSha256?: string } | null>
  
  /** Delete file. */
  delete(key: string): Promise<void>
}

// file-storage/drivers/local.driver.ts
@Injectable()
export class LocalFileStorageDriver implements FileStorageDriver {
  private readonly STORAGE_ROOT = process.env.FILE_STORAGE_LOCAL_PATH || './storage'
  
  async getUploadUrl(key: string, contentType: string) {
    // Sprint 3: returns local POST endpoint that the API receives
    return {
      url: `${process.env.API_PUBLIC_URL}/api/v1/file-storage/upload?key=${encodeURIComponent(key)}`,
      method: 'POST' as const,
    }
  }
  
  async getDownloadUrl(key: string) {
    return `${process.env.API_PUBLIC_URL}/api/v1/file-storage/download?key=${encodeURIComponent(key)}`
  }
  
  // ...
}
```

---

## 7. API Contracts (Swagger)

```http
# ── BOMs ──────────────────────────────────────────────
POST   /api/v1/products/:product_code/boms              # create new BOM version (state=draft)
GET    /api/v1/products/:product_code/boms              # list versions
GET    /api/v1/boms/:id                                 # detail with lines
GET    /api/v1/boms/:id/explode                         # multi-level flat
GET    /api/v1/boms/:id/aggregate                       # explode + aggregate by material
PATCH  /api/v1/boms/:id                                 # update meta (state=draft only)
DELETE /api/v1/boms/:id                                 # soft delete (state=draft only)

POST   /api/v1/boms/:id/lines                           # add line (XOR material_id/sub_product_id)
PATCH  /api/v1/boms/:id/lines/:line_id
DELETE /api/v1/boms/:id/lines/:line_id

# State actions
POST   /api/v1/boms/:id/action_activate                 # draft → active (deactivate previous)
POST   /api/v1/boms/:id/action_obsolete                 # → obsolete

# ── Drawings ───────────────────────────────────────────
POST   /api/v1/drawings                                 # create
GET    /api/v1/drawings?product_code=&drawing_type=&project_id=&state=
GET    /api/v1/drawings/:id

POST   /api/v1/drawings/:id/revisions                   # add revision (auto-marks is_current)
  Body: { revision: 'B', change_summary: '...', file_url: '/storage/...' }
GET    /api/v1/drawings/:id/revisions                   # full history

# State actions
POST   /api/v1/drawings/:id/action_submit_review
POST   /api/v1/drawings/:id/action_approve              { approved_uid }
POST   /api/v1/drawings/:id/action_reject
POST   /api/v1/drawings/:id/action_release              # auto-sets retention_until
POST   /api/v1/drawings/:id/action_supersede

# ── File Storage ───────────────────────────────────────
POST   /api/v1/file-storage/presigned-upload            # request upload URL
  Body: { key: 'drawings/dwg-xxx-revB.pdf', contentType: 'application/pdf' }
  Response: { url, method, fields, expires_at }
GET    /api/v1/file-storage/download?key=               # local driver only
POST   /api/v1/file-storage/upload?key=                 # local driver only (multipart)
```

---

## 8. Frontend Architecture (Epic D)

```
src/
├── api/                                  [ existing + new ]
│   ├── boms.ts                           [ NEW — BD11 ]
│   ├── drawings.ts                       [ NEW — BD13 ]
│   ├── file-storage.ts                   [ NEW — BD10 ]
│   └── ... (Sprint 1+2)
├── hooks/
│   ├── useBom.ts                         [ NEW — BD11 ]
│   ├── useDrawings.ts                    [ NEW — BD13 ]
│   └── ... (Sprint 1+2)
├── pages/
│   ├── BomEditor.tsx                     [ EXTEND — replace mock with API; BD11 ]
│   ├── BomDiffReview.tsx                 [ EXTEND — wire to real API; BD12 ]
│   └── ProductDetail.tsx                 [ EXTEND — add Drawing panel; BD13 ]
├── components/
│   ├── bom/                              [ NEW folder ]
│   │   ├── BomTree.tsx                   (multi-level tree with expand/collapse)
│   │   ├── BomLineEditor.tsx             (qty + scrap + material picker)
│   │   ├── BomActivateButton.tsx
│   │   └── BomExplodedView.tsx
│   ├── drawing/                          [ NEW folder ]
│   │   ├── DrawingPanel.tsx              (used in ProductDetail)
│   │   ├── RevisionList.tsx
│   │   ├── DrawingUpload.tsx             (presigned URL flow)
│   │   └── RevisionStatusBadge.tsx
│   └── ... (Sprint 1+2)
└── types/index.ts                        [ extend with Bom, BomLine, Drawing, Revision types ]
```

---

## 9. Test Strategy (Epic E)

### 9.1 Unit tests (BD14)

- `bom-line-xor.validator.spec.ts` — 4 cases: material only / sub_product only / both / neither
- `boms.state-machine.spec.ts` — 5 transition cases
- `bom-explosion.service.spec.ts` — 6 cases:
  - Single level, raw materials only
  - 2-level (assembly → sub-assembly → raw)
  - Scrap percentage rollup (3% × 5% = 8.15% effective)
  - Circular reference detection (throws)
  - Sub-product without active BOM (treated as leaf)
  - Aggregate by material
- `drawings.state-machine.spec.ts` — 8 transition cases
- `revision-sequence.validator.spec.ts` — A→B→C→IFC→AB allowed; backward not

### 9.2 E2E (BD15)

```
test/e2e/bom-drawings.e2e-spec.ts
  - test: 'Standard product STD-00003 (Column) → POST BOM v1.0.0 → add 3 lines → activate → state=active'
  - test: 'Add line with both material_id + sub_product_id → 422 chk_bom_line_xor'
  - test: 'Custom product CUS-00001 → POST drawing → add revision A → submit_review → approve → release → retention_until set 7 years'
  - test: 'Add revision B → A.is_current=false, B.is_current=true'
  - test: 'Try modify line of active BOM → 422 (trigger raises)'
```

### 9.3 Acceptance Criteria (Sprint Demo)

| # | Scenario | Expected |
|---|---|---|
| AC-1 | Create BOM v1.0.0 for STD-00003 with 3 raw material lines | 201 returned with bom.id; lines.length=3 |
| AC-2 | Add line with both material_id + sub_product_id | 422 chk_bom_line_xor |
| AC-3 | Add line with neither | 422 chk_bom_line_xor |
| AC-4 | Activate BOM v1.0.0 then create v2.0.0 + activate | v1 state=obsolete, v2 state=active |
| AC-5 | Try create 2nd active BOM with same view | 409 unique violation |
| AC-6 | Explode multi-level BOM (Column → WEB sub-product → plate raws) | flat list across 3 levels |
| AC-7 | Modify line on active BOM | 422 trigger raises 'requires ECO' |
| AC-8 | Create master drawing without project_id | 201 success |
| AC-9 | Create project drawing without project_id | 422 chk_drawing_type_project |
| AC-10 | Add revision A then B | A.is_current=false, B.is_current=true; only 1 row with is_current=true per drawing |
| AC-11 | Release drawing | retention_until set to now + 7 years |
| AC-12 | UI BomEditor: drag a line to reorder | sequence persisted |
| AC-13 | UI: Drawing panel in ProductDetail shows current revision badge + revision list ordered by sequence |
| AC-14 | Concurrent: 2 users add line to same draft BOM | both succeed (no race; sequence auto-assigns) |
| AC-15 | Try delete material that's referenced in active BOM line | 409 FK violation OR soft-prevent in service layer |

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|:-:|:-:|---|
| Sprint 2 schema not yet merged when Sprint 3 starts | Low | High | Sprint 3 plan written from frozen Sprint 2 contract; verify schema before BD1 migration |
| Multi-level BOM circular reference | Medium | High | Visited-set in explosion service; depth limit 10; CHECK at line insertion (sub_product_id != bom.product_id) |
| File upload size 50 MB limit hit by Tekla files | Medium | Medium | Sprint 3: enforce 50 MB; Sprint 5 S3 raises to 5 GB multipart |
| Drawing revision sequence ambiguity (e.g., revision "1.5" or "B-rev") | Low | Low | Strict enum: A,B,C,...,Z, IFC, AB only; Sprint 4 may extend |
| Local file storage filesystem permission issues | Medium | Low | Document `./storage/` setup in README; .gitignore the dir |
| BomExplosion performance on 1000+ line BOMs | Low | Medium | Index on bom_line.bom_id + sub_product_id; recursion via single SQL query (Sprint 4 optimization) |
| Active BOM lock prevents edits — blocks ECO design | Medium | Medium | Trigger error message points to ECO module (Sprint 4) |
| `bom_view='mBOM'/'sBOM'` written without proper workflow | Low | Medium | Sprint 3: validate at service level — only `eBOM` writable until Sprint 4 |
| Sprint 2 dormant FKs (master_drawing_id, shop_drawing_id) have stale data | Low | Medium | BD1 migration adds FK; existing nulls allowed; non-null values must reference real shop_drawing rows |
| Frontend BomEditor mock data incompatible with new API shape | Medium | Low | BD11 day 1 = full API contract switch; plan extra time for type alignment |

---

## 11. Definition of Done (Sprint 3)

### Backend
- [x] Prisma migration `sprint3_bom_drawings` applied + roll-back tested
- [x] Sample BOM + drawing seeded (matches 0X202 structure)
- [x] All endpoints in §7 functional with Swagger schema
- [x] Unit tests ≥80% coverage on BomExplosion + state machines + validators
- [x] E2E tests pass (5 scenarios)
- [x] mail_message audit on every BOM/Drawing create/update/state-change
- [x] CHECK constraints + triggers + FK from §4.2 active
- [x] Sprint 2 dormant FKs (`master_drawing_id`, `shop_drawing_id`) wired

### Frontend
- [x] BomEditor.tsx using real API (multi-level tree + drag-drop + scrap %)
- [x] BomDiffReview.tsx wired to real API (compares versions)
- [x] BOM activate UI button + confirmation dialog
- [x] ProductDetail.tsx shows DrawingPanel + RevisionList + current revision badge
- [x] Drawing upload via presigned URL flow (local driver Sprint 3, S3 Sprint 5)
- [x] Loading/error/empty states; toast on success/error

### Quality
- [x] CHANGELOG.md updated with Sprint 3 entries
- [x] README.md updated with new endpoint list
- [x] Swagger UI shows all new endpoints
- [x] No `console.log` in production code
- [x] ESLint + Prettier clean

### Demo Script (Friday 14:00)

1. Show migration diff — 4 new tables + Sprint 2 FK activation
2. Run seed → demonstrate WH-CO-1 BOM (3 lines) + drawing rev A
3. UI: Open ProductDetail of CUS-00001 → see BOM tree + Drawing panel
4. Create new BOM v2.0.0 → add line → activate → diff vs v1
5. Create master drawing for STD-00003 → add revision B → submit_review → approve → release
6. Show DB: retention_until = now + 7 years
7. Try modify active BOM line → 422 with helpful error pointing to ECO (Sprint 4)
8. Show BOM explode endpoint — multi-level flatten
9. Show test coverage ≥80% + Swagger

---

## 12. Open Questions for Sprint 3 Kickoff

> Most major design questions resolved through rev-1 to rev-5 (38 PDs). These are Sprint 3 specific:

1. **File storage path layout:** `./storage/drawings/{drawing_id}/rev-{revision}.pdf` or hash-based? Recommendation: hash-based for content-addressable + cache friendliness
2. **Drawing PDF preview in UI:** show inline (PDF.js) or download-only? Recommendation: download-only Sprint 3, inline preview Sprint 4 with pdf-viewer plugin
3. **BOM explosion caching:** compute on-demand (Sprint 3) or cache materialized view (Sprint 6+)? Recommendation: on-demand + measure, optimize if >500ms p95
4. **revision='AB' (As-Built) creation timing:** at site or on handover? Recommendation: deferred to Sprint 7+ (Site Erection App)
5. **Sub-product BOM activation cascade:** if sub-product BOM changes, should parent BOM auto-revise? Recommendation: NO — explicit ECO Sprint 4
6. **Tekla file (.db1, .ifc) accepted formats:** Sprint 3 limit to PDF only; Tekla native formats Sprint 5 with import adapter

---

## 13. Sprint 4+ Preview

| Sprint | Theme | Highlight |
|---|---|---|
| **4** | ECO + Routings + Promotion full | mrp.eco state machine; routing + work_centers; full Custom→Standard promotion (4 paths + Eng Mgr + Rev 7 bridge); 3-BOM full activation (mBOM by Production, sBOM by Supply Chain) |
| **5** | CAD + ERP integrations | Tekla 4-file import adapter (parses Dispatch/Assembly/AssemblyPart/PartList → creates products + BOM hierarchy + drawings); S3/MinIO swap-in; PR/PO/Stock connectors; notification webhook (email + Teams Power Automate); Odoo XML-RPC sync |
| **6** | Reporting + Cleanup + Analytics | Material aging; legacy data cleanup tool; standard cost auto-recalc; **BDT-ANALYTICS-001 Promotion Similarity Engine** (weekly batch + ML similarity scoring) |
| **7+** | Site Erection App + Microservices | Mobile erection sequence app; as-built feedback (revision AB capture from site); conditional microservice extraction per `MICROSERVICES_PLAN.md` |

---

## 14. References

- [`STANDARD_VS_CUSTOM_PRODUCT.md`](./STANDARD_VS_CUSTOM_PRODUCT.md) §5 ERD (BOM + drawing entities), §6.4 Drawing Revision Convention
- [`PROMOTION_LIFECYCLE_DESIGN.md`](./PROMOTION_LIFECYCLE_DESIGN.md) F10b 3-Mode BOM Model (eBOM/mBOM/sBOM)
- [`SPRINT_PLAN_PRODUCT.md`](./SPRINT_PLAN_PRODUCT.md) — Sprint 2 schema (consume products + materials)
- [`SPRINT_PLAN_MATERIAL_MASTER.md`](./SPRINT_PLAN_MATERIAL_MASTER.md) — Sprint 1 patterns (state machine, mail audit, validators)
- `document/0X202 อาคารคลังสินค้า/` — real Tekla BOM structure (validation source)
- AISC 303-22 §4 — Drawing approval + retention
- ISO 10007 — Configuration Management (drawing baselining)
- Odoo 17 — `mrp.bom`, `mrp.bom.line` (pattern reference)
- Siemens Opcenter PLM — 3-BOM model

---

*Prepared by: BDT Engineering — Sprint 3 Implementation Plan v1.0 (2026-04-29)*
*Aligned with: STANDARD_VS_CUSTOM_PRODUCT.md rev 5 + SPRINT_PLAN_PRODUCT.md (Sprint 2 contract)*
