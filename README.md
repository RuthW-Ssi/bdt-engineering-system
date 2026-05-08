# BDT App — Engineer Management System

> **Monolith** — React 19 (Vite) + NestJS 10 + PostgreSQL, 1 repo, 1 deployment
> **Sprint 7**: Auth/ECO/Tekla/Cloud — Planning (Sprint 5 + 6 Done)

## Quick Start

> **First time?** Follow [`docs/onboarding/dev-setup.md`](./docs/onboarding/dev-setup.md) for
> gcloud CLI install, IAM access request, and Auth Proxy setup.

### Local Dev (Backend + DB)

```bash
# 1 — Fetch DATABASE_URL from GCP Secret Manager → writes to backend/.env
bash scripts/setup-env.sh

# 2 — Start Cloud SQL Auth Proxy (keep this terminal open)
bash scripts/proxy-up.sh

# 3 — Backend — in a new terminal
cd backend
pnpm install
npx prisma migrate deploy   # apply any pending migrations
pnpm start:dev              # http://localhost:3000
                            # Swagger: http://localhost:3000/api/docs

# 4 — Frontend — in another terminal
cd ..                       # back to bdt-app/
pnpm install
pnpm dev                    # http://localhost:5173
                            # proxy /api → localhost:3000
```

**Troubleshooting:**
- `Proxy failed to start` → check `gcloud auth application-default login` was run
- `Permission denied on secret` → ask BDT lead to grant you `roles/secretmanager.secretAccessor`
- `Connection refused :5432` → proxy not running, re-run `scripts/proxy-up.sh`
- Full connection guide: [`docs/onboarding/dev-setup.md`](./docs/onboarding/dev-setup.md)

### Full Stack (Docker Compose)

```bash
docker compose up --build   # frontend :5173 · backend :3000
                            # Note: postgres removed Sprint 5 — DB is GCP Cloud SQL
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
│   │   ├── schema.prisma       ← Odoo-compatible schema (Sprint 1–6)
│   │   └── seed.ts             ← UoMs, categories, products, BOM, drawings
│   └── src/modules/
│       ├── materials/          ← Sprint 1: Material Register
│       ├── products/           ← Sprint 2: Standard/Custom products
│       ├── boms/               ← Sprint 3: BOM CRUD + explosion + state machine
│       ├── drawings/           ← Sprint 3: Shop Drawing lifecycle
│       ├── file-storage/       ← Sprint 3: Local driver (S3 swap Sprint 5)
│       ├── master-data/        ← UoMs, Categories
│       ├── mail/               ← Audit log (mail_message pattern)
│       ├── identity/           ← x-user-id stub (replaced by auth/ Sprint 6)
│       ├── auth/               ← Sprint 6: JWT auth dev mode
│       ├── customers/          ← Sprint 6: Customer CRUD
│       └── sub-zones/          ← Sprint 6: Sub-zone CRUD
├── docker-compose.yml          ← App containers only (postgres removed Sprint 5)
├── scripts/
│   ├── proxy-up.sh             ← Start Cloud SQL Auth Proxy for local dev
│   └── setup-env.sh            ← Fetch DATABASE_URL from GCP Secret Manager
└── nginx.conf
```

---

## API Reference

Full endpoint list: Swagger UI → http://localhost:3000/api/docs (when running)
Complete reference: [wiki/tech/backend/api.md](../knowledge-base/projects/bdt-engineering-system/wiki/tech/backend/api.md)

Sprint 6 adds: `/auth/*`, `/customers/*`, `/zones/:id/sub-zones`

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
| **4** | Routings (standard + custom) + BOM promotion + Routing history | ✅ Done |
| **5** | Infra — GCP Cloud SQL dev (Auth Proxy, Secret Manager, CI) | ✅ Done |
| **6** | Auth dev mode (JWT) + PM Foundation (Customer/Project/Zone/Sub-zone) | ✅ Done |
| **7** | Auth/ECO/Tekla/Cloud (planned) | 🔄 Planning |
