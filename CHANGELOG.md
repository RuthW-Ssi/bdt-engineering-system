# Changelog

## [Sprint 6] — 2026-05-08
Sprint theme: Auth dev mode + Project Management Foundation
Full task list: Notion Sprint 6 | Feature docs: wiki/features/jwt-rbac + customers-projects

### Schema (Prisma)
- NEW: `res_users` (JWT fields: login, password, role), `res_partner` (customer), `sub_zone`
- MODIFIED: `project` (customer_id FK), `project_zone` (erection_sequence; zone_type REMOVED)

### Backend
- AuthModule: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` (dev mode only)
- JwtAuthGuard + `@CurrentUser()` decorator; x-user-id stub replaced across all controllers
- CustomersModule: full CRUD `/customers`
- SubZonesModule: `/zones/:id/sub-zones` CRUD
- Admin seed: bcrypt-hashed password from `ADMIN_SEED_PASSWORD` env var

### Frontend
- LoginPage + AuthContext (localStorage JWT) + ProtectedRoute
- CustomerList, ProjectList (card UI + ProjectContext), ZoneList (drag-drop reorder)
- `@dnd-kit/sortable` for erection_sequence reorder

### Docs
- `docs/adr/0012-jwt-strategy.md`
- `docs/adr/0013-customer-hierarchy.md`

---

## [Sprint 5] — 2026-05-08
Sprint theme: Infra — GCP Cloud SQL dev environment
Full task list: Notion Sprint 5

### Schema
- Removed local Postgres; DB migrated to GCP Cloud SQL (asia-southeast1)
- `connection_limit=5` tuning; PITR backup enabled

### Infrastructure
- Cloud SQL Auth Proxy dev workflow (`scripts/proxy-up.sh`)
- GCP Secret Manager integration (`scripts/setup-env.sh`)
- GitHub Actions migration deploy (`pnpm prisma migrate deploy`)

### Docs
- `docs/adr/0011-gcp-cloud-sql-dev.md`
- `docs/onboarding/dev-setup.md`

---

## [Sprint 4.3] — 2026-04-29

### Added — Backend

- **TemplateSimulatorService** — `simulate(templateId, attributes)` runs formula eval across all template ops without writing to DB; `getRequiredAttrs()` returns distinct attribute keys used by all formula params; fixture CRUD (create/list named test inputs)
- **BulkOverrideService** — `bulkUpsert(criteria, override, { previewOnly })` matches products by `routing_template_id`, `product_type`, `mark_prefix`, JSONB `attribute_filter`; transactional upsert; skips `has_custom_routing=true` products
- **RoutingPromotionService** — `findCandidates()` groups custom routings by op_code sequence key; `promote(customRoutingId, templateName)` clones ops+activities into a new routing_template and rebinds the source product
- **3 history tables** — `routing_template_history`, `routing_activity_template_history`, `product_routing_override_history`; append-only snapshots captured by PostgreSQL BEFORE UPDATE/DELETE triggers
- **New endpoints**: `GET /routing-templates/:id/required-attrs`, `POST /routing-templates/:id/simulate`, `GET|POST /routing-templates/:id/fixtures`, `GET /routing-templates/:id/history`, `GET /activity-templates/:id/history`, `GET /products/:code/routing-overrides/:actId/history`, `POST /routing-overrides/bulk`, `GET /custom-routings/promotion-candidates`, `POST /custom-routings/:id/promote-to-template`
- `routing_template_id` added to `GET /products/:code/routing` response (required by simulator + history drawer)

### Added — Frontend

- **SimulatorPanel** (`src/components/SimulatorPanel.tsx`) — 2-mode toggle (Product / Manual); localStorage persistence per template; run → bar chart result per op; Save-as-fixture + load fixture buttons
- **HistoryDrawer** (`src/components/HistoryDrawer.tsx`) — shared slide-in drawer; supports `template` / `activity` / `override` history types; paginated (50/page); override type supports "Restore" button → `upsertRoutingOverride` with snapshot values
- **RoutingEditor.tsx** — "Simulator" toggle in header → SimulatorPanel in right panel; template History drawer in header; per-activity override history drawer with Restore (rollback)
- **ActivityTemplateMaster.tsx** — History drawer button per activity row
- **BulkOverrideAdmin.tsx** (NEW) — `/admin/bulk-overrides`; filter → preview → apply flow
- **CustomRoutingEditor.tsx** — promotion suggestion banner when ≥3 products share op_code structure; Promote to Template button
- **App.tsx** — route `/admin/bulk-overrides`

### Docs

- `docs/adr/0009-bulk-override-pattern.md`
- `docs/adr/0010-custom-routing-promotion.md`

---

## [Sprint 4.2] — 2026-04-29

### Schema Migration (Breaking)
- `mrp_routing_workcenter`: dropped `product_id`, added `template_id FK → routing_template` (1 template shared by many products)
- Dropped `routing_step_activity`; replaced by `routing_op_activity` (junction: template op → activity template) + `product_routing_override` (sparse per-product delta)
- `products`: dropped `active_routing_id`; added `routing_template_id`, `has_custom_routing`
- 7 new models: `routing_template`, `routing_op_activity`, `product_routing_override`, `custom_routing`, `custom_routing_op`, `custom_routing_activity`, `routing_template_binding_rule`

### Added — Backend
- **TemplateBindingService** — priority-ordered rules engine; `bindProduct(id)` + `rebindAll()`
- **OverrideService** — upsert/remove `product_routing_override`; Sprint-5 ECO gate stubbed with `console.warn`
- **CustomRoutingService** — create from template (clone ops+activities) or blank; add/update/delete ops+activities; `restoreToTemplate()` (obsoletes custom routing, re-binds to template)
- **CycleTimeService** — dispatch: `has_custom_routing` → `computeCustomRouting` | `routing_template_id` → `computeFromTemplate`; merges `product_routing_override` before formula eval; no per-step cache writes (dropped with routing_step_activity)
- **RoutingService** — `findByProduct()` now loads template ops + merges overrides; `activate()`/`obsolete()` update `routing_template.state`
- **New endpoints**: `/routing-templates`, `/products/:code/routing-overrides`, `/products/:code/custom-routing`, `/routing-template-binding-rules`, `/products/:code/rebind`

### Added — Frontend
- **RoutingEditor.tsx** — `ActivityRow` shows "Inherited" (gray) / "Overridden" (yellow) badge; Override button calls `upsertRoutingOverride`; Reset calls `deleteRoutingOverride`
- **CustomRoutingEditor.tsx** (NEW) — `POST /products/:code/custom-routing` conversion card with template picker; full op+activity CRUD editor; orange banner; restore-to-template flow
- **ProductDetail.tsx** — Amber "Custom Routing" badge in header when `has_custom_routing=true` (clickable → CustomRoutingEditor); Routing tab editor link adapts to custom vs template
- **BindingRuleManager.tsx** (NEW) — `/admin/binding-rules`; CRUD table for binding rules sorted by priority
- **`src/api/routings.ts`** — added Sprint 4.2 DTOs + API functions (overrides, custom routing, templates, binding rules)
- **`src/hooks/useRoutings.ts`** — added `useRoutingOverrides`
- **App.tsx** — 2 new routes: `/products/:code/custom-routing`, `/admin/binding-rules`

### Seed
- `seed-routing.ts`: creates 3 `routing_template` rows (Main/Accessory/False), 5 binding rules, binds CUS-00001 to Main

## [Sprint 4] — 2026-04-29

### Added — Backend

- **Routings Module** (`backend/src/modules/routings/`) — `mrp_workcenter`, `mrp_routing_workcenter`, `routing_step_activity`, `routing_activity_template`, `routing_formula_param` tables
- **Work Center master** — OEE targets (availability × performance × quality), labor mix JSONB, per-minute cost components (labor/electricity/consumable/overhead), capacity per period (kg/m/pc per month)
- **Activity Template master** — 41 templates imported from xlsx; each links op_code + workcenter + formula_param; paginated GET with `op_code` / `workcenter_id` filter
- **Formula Param master** — 19 formula params; safe expression evaluator via `expr-eval` (whitelist operators only); `preview` endpoint returns computed cycle time for given product attributes
- **Cycle Time service** — `compute(productId, force=false)`; walks routing operations → activities → evaluates formula with product attributes; writes `last_cycle_time_min` + `last_input_snapshot` per step; caches per `cache_key` hash; `force=true` bypasses cache
- **Std Cost service** — `compute(productId)`; multiplies cycle time per work center × per-minute cost rates → `cost_per_op[]` + `total_production_cost`
- **Routing state machine** — `draft → active → obsolete`; unique partial index enforces 1 active routing per product; active routing is read-only
- **Routing CRUD** — add/delete/reorder operations; add/patch/delete step activities with per-minute / std-measure / manpower overrides (null = inherit from template)
- **xlsx importer** — `prisma/import-routing-xlsx.ts` (activity templates + formula params from `document/`)

### Added — Frontend

- **`src/pages/RoutingList.tsx`** — paginated product list with routing state filter; pagination loop handles >100 products (API max limit=100)
- **`src/pages/RoutingEditor.tsx`** — full editor with Edit mode toggle; drag-and-drop reorder (@dnd-kit); activity override inline form; formula trace tooltip showing `last_input_snapshot`; Activate / Obsolete state actions
- **`src/pages/WorkcenterMaster.tsx`** — OEE sliders, labor mix inputs, cost component fields per work center
- **`src/pages/ActivityTemplateMaster.tsx`** — searchable paginated table; preview modal with live formula computation
- **`src/pages/ProductDetail.tsx`** — added "Routing" tab: routing state, total cycle time, per-op breakdown, production cost, Recompute button
- **`src/api/routings.ts`** — full API layer (routing CRUD, workcenter, activity template, formula param, std cost)
- **`src/hooks/useRoutings.ts`** — React Query hooks for routing, std cost, workcenters, activity templates

### API Endpoints Added (Sprint 4)

```
GET    /api/v1/products/:code/routing
POST   /api/v1/products/:code/routing
POST   /api/v1/products/:code/routing/operations
PATCH  /api/v1/products/:code/routing/operations/:opId
DELETE /api/v1/products/:code/routing/operations/:opId
POST   /api/v1/products/:code/routing/operations/:opId/activities
PATCH  /api/v1/products/:code/routing/operations/:opId/activities/:stepId
DELETE /api/v1/products/:code/routing/operations/:opId/activities/:stepId
POST   /api/v1/products/:code/routing/reorder
POST   /api/v1/products/:code/routing/action_activate
POST   /api/v1/products/:code/routing/action_obsolete
POST   /api/v1/products/:code/routing/recompute?force=true
GET    /api/v1/products/:code/std-cost
POST   /api/v1/products/:code/std-cost/recompute
GET    /api/v1/workcenters
GET    /api/v1/workcenters/:id
PATCH  /api/v1/workcenters/:id
GET    /api/v1/activity-templates
GET    /api/v1/activity-templates/:id
POST   /api/v1/activity-templates/:id/preview
GET    /api/v1/formula-params
GET    /api/v1/routings/templates
```

---

## [Sprint 3] — 2026-04-28

### Added — Backend

- **BOM Module** (`backend/src/modules/boms/`) — `product_bom` + `bom_line` tables; CRUD endpoints; state machine `draft → active → obsolete`; only 1 active BOM per product per `bom_view` (unique partial index)
- **BOM line XOR validator** — exactly one of `material_id` or `sub_product_id` must be set; enforced at service layer + DB CHECK constraint
- **BOM Explosion service** — `GET /boms/:id/explode` flattens multi-level BOM with scrap rollup; `GET /boms/:id/aggregate` collapses by material; circular-ref detector (visited-set); max depth 10
- **BOM view foundation** — `bom_view` enum (`eBOM`/`mBOM`/`sBOM`) + `owner_role`; only `eBOM` writable in Sprint 3
- **BOM audit hooks** — `mail_message` written on create/update/state-change
- **Drawings Module** (`backend/src/modules/drawings/`) — `shop_drawing` + `drawing_revision` tables; state machine `draft → in_review → approved → released → superseded | obsolete`
- **Revision sequence validator** — A→B→C→...→IFC→AB ordering; backward revision rejected with 400
- **FileStorage Module** — `LocalFileStorageDriver`; `getUploadUrl` / `getDownloadUrl` / `getMetadata` / `delete`; S3 swap-in deferred to Sprint 5
- **DB triggers** — `trg_drawing_retention` (auto-set `retention_until` = now + 7 years on release); `trg_bom_line_immutable_after_active` (blocks BOM line modifications when state = active/obsolete)
- **Seed data** — BOM for CUS-00001 (WH-CO-1 Column: 3 material lines from 0X202 Tekla); shop drawing `DWG-0X202R1-WH-CO-1` with revision A

### Added — Frontend

- **`src/api/boms.ts`** — API layer for BOM endpoints (list, get, activate, update/delete line)
- **`src/api/drawings.ts`** — API layer for Drawing endpoints (list by product, get detail with revisions)
- **`src/hooks/useBom.ts`** — React hook; fetches BOM list + detail; converts flat lines → BomNode tree; exposes `updateLineQty`, `deleteLineById`, `refresh`
- **`src/hooks/useBomDiff.ts`** — computes add/remove/modified/unchanged diff between two BOM versions
- **`src/hooks/useDrawings.ts`** — fetches drawings for a product
- **BomEditor.tsx** — wired to real API; shows real BOM lines from DB; Activate button (draft → active); version badge; loading/error/empty states; ErrorBoundary added in AppShell
- **BomDiffReview.tsx** — wired to real API; version selectors populated from `bomList`; diff computed from actual BOM line arrays
- **ProductDetail.tsx** — added "Drawings" tab: shows all shop drawings per product with revision list, current revision badge (highlighted), file size, download button

### Fixed

- **Blank page on direct navigation** — `useBom` initializes `loading=true` when `productCode` is provided; `PageErrorBoundary` added in `AppShell` catches render errors and shows error card instead of silent blank

### API Endpoints Added (Sprint 3)

```
POST   /api/v1/products/:code/boms
GET    /api/v1/products/:code/boms
GET    /api/v1/boms/:id
GET    /api/v1/boms/:id/explode
GET    /api/v1/boms/:id/aggregate
PATCH  /api/v1/boms/:id
DELETE /api/v1/boms/:id
POST   /api/v1/boms/:id/lines
PATCH  /api/v1/boms/:id/lines/:lineId
DELETE /api/v1/boms/:id/lines/:lineId
POST   /api/v1/boms/:id/action_activate
POST   /api/v1/boms/:id/action_obsolete
POST   /api/v1/drawings
GET    /api/v1/drawings
GET    /api/v1/drawings/:id
PATCH  /api/v1/drawings/:id
POST   /api/v1/drawings/:id/revisions
GET    /api/v1/drawings/:id/revisions
POST   /api/v1/drawings/:id/action_submit_review
POST   /api/v1/drawings/:id/action_approve
POST   /api/v1/drawings/:id/action_reject
POST   /api/v1/drawings/:id/action_release
POST   /api/v1/drawings/:id/action_supersede
POST   /api/v1/drawings/:id/action_obsolete
POST   /api/v1/file-storage/presigned-upload
GET    /api/v1/file-storage/download
POST   /api/v1/file-storage/upload
```

---

## [Sprint 1] — 2026-04-28

### Added
- **Backend scaffold** (`backend/`) — NestJS 10 + Prisma 6 + PostgreSQL 16, monolith inside `bdt-app/`
- **Odoo-compatible schema** — `res_users`, `uom_category`, `uom_uom`, `account_account`, `product_category`, `materials`, `part_code_seq`, `mail_message`
- **Seed data** — 20 standard UoMs, 7 confirmed product groups (+ 6 steel groups stub), admin user, account codes
- **Material API** — `POST/GET/PATCH /api/v1/materials` + `action_submit/confirm/cancel/assign_runno`
- **Part Code Generator** — `<prefix5><NNNNN>` with `SELECT FOR UPDATE` concurrency safety
- **Validation** — Description (UPPERCASE EN, 2 parts), UoM FK, Category FK, Attributes per group (Zod)
- **Duplicate Detector** — grade + dimensions ±5% tolerance, returns warning not block
- **State Machine** — `draft → to_approve → confirmed → cancel → blocked`
- **Audit Log** — `mail_message` written in-process on create/update/action
- **Swagger UI** — `/api/docs`
- **Frontend API client** — `src/api/` (axios, Odoo field naming), React Query hooks
- **ProductList** — now fetches from real backend with loading/error states
- **MaterialRegisterModal** — dynamic attribute fields per category, duplicate warning
- **ProductDetail** — "ส่งให้ตรวจสอบ" button wired to `action_submit` API
- **docker-compose.yml** — `postgres + backend + frontend` via single `docker compose up`
- **Vite proxy** — `/api` → `http://localhost:3000` (dev)
- **Unit tests** — 28 tests, validators + state machine + part-code generator (100% coverage on tested files)

### Architecture
- Monolith: 1 repo, FE + BE, no event bus
- Odoo-compatible naming convention (ADR-01 → ADR-14)
- Microservices deferred to Sprint 7+ (`MICROSERVICES_PLAN.md`)
