# Changelog

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
