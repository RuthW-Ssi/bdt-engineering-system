# BDT App — Material Master Module

> **Monolith** — React 19 (Vite) + NestJS 10 + PostgreSQL 16, 1 repo, 1 deployment

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
│   │   ├── schema.prisma       ← Odoo-compatible schema
│   │   └── seed.ts             ← 20 UoMs, 7+ categories, admin user
│   └── src/modules/
│       ├── materials/          ← Core domain (CRUD + validators + part code)
│       ├── master-data/        ← UoMs, Categories
│       ├── mail/               ← Audit log (mail_message pattern)
│       └── identity/           ← x-user-id stub (Sprint 3 → JWT)
├── docker-compose.yml
└── nginx.conf
```

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

| Sprint | Theme |
|--------|-------|
| ✅ **1** | Backend scaffold + Material Register API + Frontend wiring |
| 2 | Approval flow + Warehouse run number + Substitute Part |
| 3 | Master extension (full 13 groups) + RBAC (JWT + res_groups) |
| 4 | ECO versioning + BIM/Dashboard |
| 5 | Odoo XML-RPC integration |
| 6 | Reporting + Bulk import (Excel) |
