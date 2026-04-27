# Changelog

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
