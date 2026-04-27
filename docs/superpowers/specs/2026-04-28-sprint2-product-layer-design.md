# Sprint 2 — Product Layer Design Spec

> **Date:** 2026-04-28
> **Source:** SPRINT_PLAN_PRODUCT.md (18 stories, P1-P18)
> **Architecture:** Monolith — extend existing backend/ (NestJS 10 + Prisma 6 + PG 16) and src/ (React 19 + Vite)

---

## 1. Context

Sprint 1 delivered the Material Master (10-char Part Code + 13 material groups). Sprint 2 builds the **Product Layer** on top: standard products (reusable catalog, Odoo-compatible) and custom products (per-project, steel-specific marks). This enables the engineering team to register both product types with proper code generation, validation, and audit trails.

**Key decisions made during design review:**
- `mail_message` → **Polymorphic** (drop FK, use `model` + `res_id`)
- `product_category` → **Seed 7 new groups** + create MAIN_STRUCTURES for standard templates
- 12 BDTOM templates → map to **new MAIN_STRUCTURES category**
- Implementation → **Sequential by Epic** (Schema → Backend → Frontend → Tests)

---

## 2. Schema & Seed (P1-P2)

### 2.1 New Prisma Models

8 new models per SPRINT_PLAN_PRODUCT.md §4.1:
- `project` — project entity with 7-state machine
- `project_zone` — erection zones per project, unique (project_id, code)
- `mark_prefix_master` — 27 steel mark prefixes (PK = code)
- `tekla_prefix_mapping` — 21 Tekla-to-BDT prefix mappings
- `products` — single-table inheritance (standard + custom discriminator)
- `product_variant` — lazy-create variants for standard products
- `project_product_cost` — per-project cost overrides
- `promotion_request` — skeleton for Sprint 4 promotion workflow
- `steel_grade` — material grade master (SS400, HY370, etc.)

### 2.2 Schema Modifications

**`mail_message`** — Polymorphic refactor:
- Remove `material materials @relation(...)` FK
- Keep `model` (String) + `res_id` (Int) as generic reference
- Add composite index on `(model, res_id)`
- Update `MailMessageService` to accept `model` parameter

**`res_users`** — Add relation fields for new models:
- `projects_created`, `projects_written`
- `products_created`, `products_written`

**`product_category`** — Add relation to `products`

### 2.3 Raw SQL Migration

Per SPRINT_PLAN_PRODUCT.md §4.2:
- `standard_cost_total` GENERATED ALWAYS AS computed column on `products`
- `cost_total` GENERATED ALWAYS AS computed column on `project_product_cost`
- `product_code_seq` counter table (STD + CUS)
- CHECK `chk_product_type_fields` — enforce field nullability by product_type
- CHECK `chk_product_code_prefix` — STD-* for standard, CUS-* for custom
- CHECK `chk_item_code_required` — item_code required when sale_ok or purchase_ok
- CHECK `chk_item_code_length` — exactly 10 chars when present
- UNIQUE INDEX `idx_custom_mark_per_project_zone` — partial, custom marks unique per (project, zone)
- TRIGGER `trg_mark_immutable` — prevent mark_prefix/number change after release
- Performance indexes: categ, state, project, attributes GIN, promoted_from, legacy_codes GIN

### 2.4 Seed Data

Extend existing `prisma/seed.ts` (all idempotent upserts):
- 27 `mark_prefix_master` rows (from §5.1)
- 21 `tekla_prefix_mapping` rows (from §5.2)
- 7 `steel_grade` rows (from §5.3)
- 7 new `product_category` groups (placeholder names — finalize labels later)
- 1 `MAIN_STRUCTURES` category (group 8, for standard product templates)
- 12 BDTOM standard product templates (from §5.4, state=draft, categ_id → MAIN_STRUCTURES)
- 1 sample project `0X202` + 2 zones (WH, OF)
- 2 `product_code_seq` rows: STD next_run=13, CUS next_run=1

---

## 3. Backend Modules (P3-P10)

### 3.1 Module Structure

```
backend/src/modules/
├── mark-prefix-master/     GET-only catalog
│   ├── mark-prefix.controller.ts
│   ├── mark-prefix.service.ts
│   └── mark-prefix.module.ts
├── projects/               CRUD + state machine
│   ├── dto/create-project.dto.ts, update-project.dto.ts, query-project.dto.ts
│   ├── projects.controller.ts
│   ├── projects.service.ts
│   ├── projects.state-machine.ts
│   └── projects.module.ts
├── project-zones/          CRUD nested + reorder
│   ├── dto/create-zone.dto.ts, update-zone.dto.ts, reorder-zones.dto.ts
│   ├── project-zones.controller.ts
│   ├── project-zones.service.ts
│   └── project-zones.module.ts
└── products/               Discriminator-aware CRUD + validators + code gen
    ├── dto/create-standard-product.dto.ts, create-custom-product.dto.ts,
    │   update-product.dto.ts, query-product.dto.ts
    ├── validators/product-type.validator.ts, standard-product.validator.ts,
    │   custom-product.validator.ts
    ├── product-code.generator.ts
    ├── products.state-machine.ts
    ├── products.controller.ts
    ├── products.service.ts
    └── products.module.ts
```

### 3.2 Mark Prefix Master

- `GET /api/v1/mark-prefixes` — query: `category`, `active`
- Returns all 27 prefixes, grouped by category for frontend dropdown

### 3.3 Projects Module

- `POST /api/v1/projects`, `GET /api/v1/projects`, `GET /:project_code`, `PATCH /:project_code`
- State machine: `lead → won → in_design → in_fab → in_erection → handover → closed`
- Pattern: same as Materials (controller → service → prisma, IdentityService, mail audit)

### 3.4 Project Zones Module

- Nested: `GET/POST /api/v1/projects/:id/zones`, `PATCH /:id/zones/:zone_id`
- Reorder: `PATCH /api/v1/projects/:id/zones/reorder` — body: `{ sequence: [id, ...] }`
- Constraint: unique (project_id, code)

### 3.5 Products Module

**Endpoints:**
- `POST /api/v1/products` — discriminator: `product_type` = 'standard' | 'custom'
- `GET /api/v1/products` — filter: product_type, state, categ_id, project_id, q, page, limit
- `GET /api/v1/products/:product_code`
- `PATCH /api/v1/products/:product_code`
- State actions: `POST /:product_code/action_submit_design`, `action_submit_review`, `action_approve`, `action_release`, `action_obsolete`
- Audit: `GET /:product_code/messages`

**ProductCodeGenerator:**
- `product_code_seq` table with SELECT FOR UPDATE (same pattern as PartCodeGenerator)
- `generate('STD')` → `STD-00013`, `generate('CUS')` → `CUS-00001`
- Code assigned immediately at creation (no pending state)

**Validators — Standard:**
- 4 cost components ≥ 0
- If sale_ok OR purchase_ok → item_code required, exactly 10 chars, pattern ^[A-Z0-9]{10}$
- variant_attributes: optional JSON

**Validators — Custom:**
- project_id required + FK check
- mark_prefix required + FK to mark_prefix_master
- mark_number required
- Unique check: (project_id, COALESCE(erection_zone_id, 0), mark_prefix, mark_number)
- engineer_hours_est ≥ 0

**State Machine:**
```
draft → in_design → in_review → approved → released → obsolete
             ↑           ↑           ↑
             └── draft ←──┘           │
                         └── in_design ←┘
```

### 3.6 Mail Audit (Polymorphic)

- Refactor `MailMessageService.log()` — add `model` parameter (default 'material' for backward compat)
- Refactor `MailMessageService.thread()` — filter by `(model, res_id)`
- Products service calls `mail.log({ model: 'product', res_id: ... })` on create/update/state-change

---

## 4. Frontend (P11-P15)

### 4.1 API Clients & Hooks

**Files to create:**
- `src/api/products.ts` — list, get, create, update, action*, getMessages
- `src/api/projects.ts` — list, get, create, update
- `src/api/project-zones.ts` — list, create, update, reorder
- `src/api/mark-prefix-master.ts` — list

**Hooks:**
- `src/hooks/useProducts.ts` — useProducts, useProduct, useCreateProduct, useUpdateProduct, useProductAction
- `src/hooks/useProjects.ts` — useProjects, useProject
- `src/hooks/useProjectZones.ts` — useProjectZones
- `src/hooks/useMarkPrefixes.ts` — useMarkPrefixes

**Types (extend `src/api/types.ts`):**
- ProductDTO (discriminated by product_type), ProductListResponse
- ProjectDTO, ProjectZoneDTO, MarkPrefixDTO
- CreateStandardProductPayload, CreateCustomProductPayload

### 4.2 ProductList Page (extend existing)

- Add type tabs: Standard | Custom
- Tab → sets `product_type` query param
- Standard: show product_code, engineering_code, item_code, category, state
- Custom: show product_code, project, zone, mark display "{Zone}-{Prefix}-{Number}", state
- Project filter dropdown (Custom tab only)
- "Add" button → opens correct modal per active tab
- URL params persist: `?tab=standard&state=draft&q=beam`

### 4.3 NewStandardProductModal

- Category*, Name*, engineering_code (opt), sale_ok toggle, purchase_ok toggle
- item_code (10 chars, shown when sale_ok OR purchase_ok)
- 4 cost components + live standard_cost_total rollup
- variant_attributes JSON editor (opt)
- stock_policy, reorder_min/max
- Same modal pattern as MaterialRegisterModal

### 4.4 NewCustomProductModal

- Project* dropdown → Zone dropdown (filtered by project)
- Mark Prefix* dropdown — grouped by category, from mark_prefix_master API
- Mark Number* — live preview "{Zone}-{Prefix}-{Number}"
- Category*, Name*, engineer_hours_est (opt), attributes JSON (opt)
- Live duplicate check on mark_number blur

### 4.5 ProductDetail Page (extend existing)

- Fetch via useProduct(code) instead of useMaterial
- Dual identifier: product_code + engineering_code + item_code
- ProductTypeBadge: Standard (blue) / Custom (orange)
- Tabs: Overview, Specs, Cost, Audit Log
- Conditional sections per product_type
- State action buttons in header
- Audit Log tab: real mail_message data

### 4.6 New Components

- `src/components/product/NewStandardProductModal.tsx`
- `src/components/product/NewCustomProductModal.tsx`
- `src/components/product/MarkPrefixDropdown.tsx` — reusable grouped dropdown
- `src/components/product/CostComponentInput.tsx` — 4-field cost editor with live total
- `src/components/product/VariantMatrixEditor.tsx` — optional JSON editor
- `src/components/product/ProductTypeBadge.tsx` — Standard/Custom badge

---

## 5. Tests & Quality (P16-P18)

### 5.1 Unit Tests

| File | Cases | Target |
|---|---|---|
| product-code.generator.spec.ts | 10 concurrent → unique codes | ≥90% |
| standard-product.validator.spec.ts | 8 cases (cost, item_code, variants) | ≥80% |
| custom-product.validator.spec.ts | 6 cases (project FK, mark, uniqueness) | ≥80% |
| products.state-machine.spec.ts | 7 transitions (valid + invalid) | ≥90% |
| product-type.validator.spec.ts | discriminator nullability rules | ≥80% |

### 5.2 E2E Tests

```
test/e2e/products.e2e-spec.ts
  - standard → submit_design → in_review → approved → released
  - custom under 0X202 zone WH → mark C-1 → unique check
  - standard sale_ok=true missing item_code → 422
  - duplicate mark same zone → 409
```

### 5.3 Docs

- Swagger UI at /api/docs — all new endpoints with examples
- CHANGELOG.md updated with Sprint 2 entries
- README.md updated with new endpoint list

---

## 6. Verification

### Backend
- [ ] `npx prisma migrate dev` succeeds
- [ ] `npx ts-node prisma/seed.ts` is idempotent
- [ ] All Swagger endpoints documented at /api/docs
- [ ] `npm test --coverage` ≥80%
- [ ] E2E tests pass

### Frontend
- [ ] Dev server starts without errors
- [ ] ProductList tabs switch Standard/Custom
- [ ] NewStandardProductModal → STD-xxxxx
- [ ] NewCustomProductModal → CUS-xxxxx
- [ ] Mark prefix dropdown: 27 options grouped by category
- [ ] Duplicate mark → error toast
- [ ] ProductDetail: dual identifier + audit log
- [ ] URL params persist on refresh

### Acceptance Criteria (from SPRINT_PLAN_PRODUCT.md §9.3)
- AC-1 through AC-13 all pass

---

## 7. Files to Modify/Create

### Modified (existing)
- `backend/prisma/schema.prisma` — add 9 new models, modify mail_message + res_users
- `backend/prisma/seed.ts` — extend with new seed data
- `backend/src/app.module.ts` — register 4 new modules
- `backend/src/main.ts` — update Swagger title/description
- `backend/src/modules/mail/mail-message.service.ts` — polymorphic model param
- `src/api/types.ts` — add Product, Project, Zone, MarkPrefix types
- `src/pages/ProductList.tsx` — add type tabs, project filter, new data source
- `src/pages/ProductDetail.tsx` — polymorphic product detail
- `src/App.tsx` — add /projects route
- `src/data/meta.ts` — add product state meta for new states
- `src/types/index.ts` — add new type definitions

### Created (new)
- `backend/prisma/migrations/sprint2_product_layer/manual.sql`
- `backend/src/modules/mark-prefix-master/` (3 files)
- `backend/src/modules/projects/` (6 files)
- `backend/src/modules/project-zones/` (5 files)
- `backend/src/modules/products/` (11 files)
- `src/api/products.ts`, `projects.ts`, `project-zones.ts`, `mark-prefix-master.ts`
- `src/hooks/useProducts.ts`, `useProjects.ts`, `useProjectZones.ts`, `useMarkPrefixes.ts`
- `src/components/product/` (6 files)
- `backend/src/modules/products/*.spec.ts` (5 test files)
- `backend/test/e2e/products.e2e-spec.ts`

---

*Spec reviewed: no TBD items, no contradictions, scope is focused for single implementation plan.*
