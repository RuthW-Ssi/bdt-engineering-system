# BDT App — Engineer Management System

> **Monolith** — React 19 (Vite) + NestJS 10 + PostgreSQL 16, 1 repo, 1 deployment
> **Sprint 3**: BOM (multi-level, 3-view foundation) + Shop Drawings (revision lifecycle + file storage)

## Quick Start

### Local Dev (Backend + DB)

```bash
# Start PostgreSQL only
docker compose up postgres -d

# Backend — run migrations + seed + start watch
cd backend
cp .env.example .env        # adjust DATABASE_URL if needed
npm install
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
npm run start:dev            # http://localhost:3000
                             # Swagger: http://localhost:3000/api/docs

# Frontend — in separate terminal
cd ..                        # back to bdt-app/
pnpm install
pnpm dev                     # http://localhost:5173
                             # proxy /api → localhost:3000
```

### Full Stack (Docker Compose)

```bash
docker compose up --build    # frontend :5173 · backend :3000 · postgres :5432
```

---

## Project Structure

```
bdt-app/                        ← Monolith root
├── src/                        ← React 19 + Vite (frontend)
│   ├── api/                    ← Axios API client (Odoo field naming)
│   ├── hooks/                  ← React Query hooks
│   ├── pages/                  ← ProductList, ProductDetail, MaterialRegisterModal
│   └── types/                  ← TypeScript types
├── backend/                    ← NestJS 10
│   ├── prisma/
│   │   ├── schema.prisma       ← Odoo-compatible schema (Sprint 1–3)
│   │   └── seed.ts             ← UoMs, categories, products, BOM, drawings
│   └── src/modules/
│       ├── materials/          ← Sprint 1: Material Register
│       ├── products/           ← Sprint 2: Standard/Custom products
│       ├── boms/               ← Sprint 3: BOM CRUD + explosion + state machine
│       ├── drawings/           ← Sprint 3: Shop Drawing lifecycle
│       ├── file-storage/       ← Sprint 3: Local driver (S3 swap Sprint 5)
│       ├── master-data/        ← UoMs, Categories
│       ├── mail/               ← Audit log (mail_message pattern)
│       └── identity/           ← x-user-id stub (JWT Sprint 4)
├── docker-compose.yml
└── nginx.conf
```

---

## API Endpoints (Sprint 3 — current)

### BOM

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/products/:code/boms` | Create BOM version (state=draft) |
| `GET` | `/api/v1/products/:code/boms` | List BOM versions |
| `GET` | `/api/v1/boms/:id` | Get BOM detail with lines |
| `GET` | `/api/v1/boms/:id/explode` | Multi-level flat explosion + scrap rollup |
| `GET` | `/api/v1/boms/:id/aggregate` | Explode + aggregate by material |
| `PATCH` | `/api/v1/boms/:id` | Update BOM meta (draft only) |
| `DELETE` | `/api/v1/boms/:id` | Soft-delete (draft only) |
| `POST` | `/api/v1/boms/:id/lines` | Add line (XOR material_id / sub_product_id) |
| `PATCH` | `/api/v1/boms/:id/lines/:lineId` | Update line (draft only) |
| `DELETE` | `/api/v1/boms/:id/lines/:lineId` | Remove line (draft only) |
| `POST` | `/api/v1/boms/:id/action_activate` | draft → active (deactivates previous) |
| `POST` | `/api/v1/boms/:id/action_obsolete` | → obsolete |

### Drawings

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/drawings` | Create drawing |
| `GET` | `/api/v1/drawings` | List drawings (`?product_code=&state=&drawing_type=`) |
| `GET` | `/api/v1/drawings/:id` | Detail with all revisions |
| `PATCH` | `/api/v1/drawings/:id` | Update (draft only) |
| `POST` | `/api/v1/drawings/:id/revisions` | Add revision (auto A→B→C→IFC→AB) |
| `GET` | `/api/v1/drawings/:id/revisions` | Full revision history |
| `POST` | `/api/v1/drawings/:id/action_submit_review` | draft → in_review |
| `POST` | `/api/v1/drawings/:id/action_approve` | in_review → approved |
| `POST` | `/api/v1/drawings/:id/action_reject` | in_review → draft |
| `POST` | `/api/v1/drawings/:id/action_release` | approved → released (sets retention_until) |
| `POST` | `/api/v1/drawings/:id/action_supersede` | released → superseded |
| `POST` | `/api/v1/drawings/:id/action_obsolete` | → obsolete |

### File Storage

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/file-storage/presigned-upload` | Get upload URL |
| `GET` | `/api/v1/file-storage/download?key=` | Download file (local driver) |
| `POST` | `/api/v1/file-storage/upload?key=` | Upload file (local driver) |

---

## API Endpoints (Sprint 1)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/materials` | Register new material (state=draft) |
| `GET`  | `/api/v1/materials` | List with filters: `state`, `categ_id`, `q`, `page`, `limit` |
| `GET`  | `/api/v1/materials/:default_code` | Get single material |
| `PATCH` | `/api/v1/materials/:default_code` | Update (Odoo write pattern, diff tracked) |
| `POST` | `/api/v1/materials/:default_code/action_submit` | draft → to_approve |
| `POST` | `/api/v1/materials/:default_code/action_confirm` | to_approve → confirmed |
| `POST` | `/api/v1/materials/:default_code/action_cancel` | → cancel |
| `POST` | `/api/v1/materials/:default_code/action_assign_runno` | Warehouse: assign run number |
| `GET`  | `/api/v1/materials/:default_code/messages` | Audit log thread |
| `GET`  | `/api/v1/uoms` | List UoMs |
| `GET`  | `/api/v1/product-categories` | List categories |
| `GET`  | `/api/v1/healthz` | Liveness |
| `GET`  | `/api/v1/readyz` | Readiness (DB ping) |
| `GET`  | `/api/docs` | Swagger UI |

---

## Backend Tests

```bash
cd backend
npm test                # unit tests (28 cases)
npm run test:cov        # coverage report
npm run test:e2e        # E2E (requires DB)
```

---

## Architecture Decisions

See [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) for full ADR.

Key decisions for Sprint 1:
- **Odoo-compatible schema**: `default_code`, `categ_id`, `uom_id`, `state`, `active`, `create_uid/date`, `write_uid/date`
- **Part Code**: 10-digit `<prefix5><NNNNN>` — atomic via `SELECT FOR UPDATE` on `part_code_seq`
- **Audit log**: `mail_message` table (model + res_id + tracking JSONB) — in-process with business write
- **State machine**: `draft → to_approve → confirmed → cancel` (Odoo `action_*` convention)
- **Auth**: `x-user-id` header stub (Sprint 3 → JWT + `res_groups`)
- **Microservices**: DEFERRED — see `MICROSERVICES_PLAN.md`

---

## Sprint Roadmap

| Sprint | Theme | Status |
|--------|-------|--------|
| **1** | Backend scaffold + Material Register API + Frontend wiring | ✅ Done |
| **2** | Products (Standard/Custom) + Projects + Mark system | ✅ Done |
| **3** | BOM (multi-level + 3-view) + Shop Drawings + FileStorage | ✅ Done |
| **4** | ECO module + Routings + 3-BOM promotion full workflow | Planned |
| **5** | Tekla import adapter + S3/MinIO + Odoo XML-RPC sync | Planned |
| **6** | Reporting + BOM cost rollup + Bulk import (Excel) | Planned |
