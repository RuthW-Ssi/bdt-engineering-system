# Microservices Implementation Plan — BDT (1 Repo per Service)

> **🟡 STATUS: DEFERRED — เก็บไว้เป็น future architecture reference (Sprint 5+ ขึ้นไปค่อยพิจารณา)**
>
> **เหตุผลที่ defer:** ทีมตัดสินใจเริ่ม monolith ก่อน (FE + BE 1 repo) เพื่อลด overhead — ดู [`SPRINT_PLAN_MATERIAL_MASTER.md`](./SPRINT_PLAN_MATERIAL_MASTER.md) ที่เป็นแผนปัจจุบัน
>
> **เก็บเอกสารนี้ไว้ทำไม:**
> - ใช้เป็น north-star architecture เมื่อทีมโตขึ้น / โหลดสูงขึ้น
> - Bounded contexts (§1) ยังเป็น guide สำหรับจัด NestJS modules ใน monolith — module ที่จะแยกเป็น service ในอนาคต
> - Strangler pattern (§12) — ถ้าวันหน้าจะแยก ให้ refer document นี้
>
> ---
>
> **(เนื้อหาเดิม) Goal:** แบ่งระบบ BDT เป็น microservices แต่ละตัวอยู่ใน Git repo แยก (polyrepo)
> **Architecture choices (จาก Q&A ก่อนหน้า):**
> - 🟦 **Inter-service comms:** REST sync (read/command) + RabbitMQ event bus (audit/notification/integration)
> - 🟦 **Database:** PostgreSQL **DB-per-service**
> - 🟦 **Orchestration (prod):** Docker Compose / Swarm (single host หรือ multi-node Swarm)
> - 🟦 **Shared code:** NPM private registry (Verdaccio / GitHub Packages)
> - 🟦 **Naming:** ใช้ Odoo conventions ตาม [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md)
>
> **Companion docs:**
> - [`SPRINT_PLAN_MATERIAL_MASTER.md`](./SPRINT_PLAN_MATERIAL_MASTER.md) — sprint 1 (จะ refactor ให้ตรง §10 ของเอกสารนี้)
> - [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) — ADR

---

## 1. Bounded Contexts → Services

ระบุ bounded context จาก domain (Material Master + กลุ่มงานที่จะตามมา) แล้ว map เป็น service:

| # | Service | Bounded Context | Owns | Sprint introduce |
|---|---|---|---|:-:|
| 1 | **bdt-frontend** | Web UI (React) | `app shell`, all UI pages | (มีอยู่แล้ว) |
| 2 | **bdt-gateway** | API Gateway / BFF | routing, auth check, rate limit, OpenAPI aggregation | 1 |
| 3 | **bdt-identity-service** | Identity & Access (Odoo `res.users`/`res.groups`) | users, groups, JWT, RBAC | 1 (stub) → 3 (full) |
| 4 | **bdt-master-data-service** | Master tables (UoM, Product Category, Account) | `uom_uom`, `uom_category`, `product_category`, `account_account` | 1 |
| 5 | **bdt-material-service** | Material Master + Registration | `materials`, `part_code_seq`, validators, duplicate detector | 1 |
| 6 | **bdt-audit-service** | Audit log / mail.thread | `mail_message`, tracking diffs, comments | 1 (consumer) |
| 7 | **bdt-eco-service** | Engineering Change Order | `mrp_eco`, version graph, approvals | 4 |
| 8 | **bdt-bom-service** | Bill of Materials | `mrp_bom`, `mrp_bom_line` | 5 |
| 9 | **bdt-routing-service** | Routing & Work Center | `mrp_routing`, `mrp_workcenter` | 5 |
| 10 | **bdt-notification-service** | Email / Line / Slack | template, subscribers | 2 |
| 11 | **bdt-odoo-sync-service** | Bridge ↔ Odoo จริง (XML-RPC) | sync state, FK mapping | 5 |
| 12 | **bdt-platform-infra** | Docker Compose, env templates, Traefik, secrets | infra-as-code | 1 |
| 13 | **bdt-shared-contracts** | NPM packages: types, DTOs, events, SDK | published `@bdt/*` packages | 1 |

**สิ่งที่ Sprint 1 ต้องสร้างจริง:** repo #1, #2, #3 (stub), #4, #5, #6, #12, #13 = **8 repos** (ที่เหลือ scaffold เปล่าไว้ก่อน)

---

## 2. Repository Naming & Conventions

### 2.1 Naming
- Pattern: `bdt-<service-name>-service` (ยกเว้น frontend, gateway, infra, contracts)
- Owner: GitHub org `ssi-steel/bdt` (สมมติ)
- Visibility: private
- Default branch: `main` (protected)

### 2.2 ภายในแต่ละ repo (NestJS service)

```
bdt-material-service/
├── .github/
│   └── workflows/
│       ├── ci.yml                   # lint + test + build + publish docker
│       └── release.yml              # tag → push image to registry
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.validation.ts        # zod
│   │   └── configuration.ts
│   ├── common/                      # filters, pipes, interceptors, guards
│   ├── prisma/                      # prisma schema + migrations
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── modules/
│   │   └── materials/
│   │       ├── dto/
│   │       ├── validators/
│   │       ├── materials.controller.ts
│   │       ├── materials.service.ts
│   │       ├── materials.module.ts
│   │       └── part-code.generator.ts
│   ├── clients/                     # SDK ของ service อื่น (ดึงจาก @bdt/master-data-sdk ฯลฯ)
│   ├── events/
│   │   ├── publishers/              # publish ไป RabbitMQ
│   │   └── consumers/               # subscribe events อื่น
│   └── health/                      # /healthz + /readyz
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.dev.yml       # dev mode (just this service + its DB + RMQ)
├── docs/
│   ├── README.md                    # quick start
│   ├── ADR.md                       # link/ relevant ADRs
│   ├── api.md                       # endpoint reference
│   └── events.md                    # events published / consumed
├── .env.example
├── .nvmrc                           # node version
├── package.json
├── tsconfig.json
└── nest-cli.json
```

### 2.3 Shared standards (ทุก repo)
- **Node:** v20 LTS (lock ผ่าน `.nvmrc`)
- **Package mgr:** pnpm
- **Framework:** NestJS 10
- **ORM:** Prisma 5
- **Linter/Formatter:** ESLint + Prettier (config มาจาก `@bdt/eslint-config`)
- **Test:** Jest + Supertest + Testcontainers (สำหรับ DB integration test)
- **Container:** distroless multi-stage build, image size <200MB
- **Health checks:** `/healthz` (liveness), `/readyz` (readiness — check DB + RMQ)
- **Observability:** OpenTelemetry SDK auto-instrument, log JSON ไป stdout (Loki)
- **Versioning:** semver, image tag = git short SHA + branch + semver

---

## 3. Shared Contracts (NPM Private Packages)

Repo: **`bdt-shared-contracts`** publish หลาย packages → NPM private registry (Verdaccio in `bdt-platform-infra`)

```
bdt-shared-contracts/
├── packages/
│   ├── eslint-config/               # @bdt/eslint-config
│   ├── tsconfig/                    # @bdt/tsconfig
│   ├── types/                       # @bdt/types — domain types (Material, Uom, ...)
│   ├── events/                      # @bdt/events — event schemas (Avro/JSON Schema)
│   ├── nest-common/                 # @bdt/nest-common — interceptors, exception filters, ConfigModule
│   ├── master-data-sdk/             # @bdt/master-data-sdk — typed REST client
│   ├── identity-sdk/                # @bdt/identity-sdk
│   ├── audit-sdk/                   # @bdt/audit-sdk
│   └── material-sdk/                # @bdt/material-sdk
├── package.json (workspace)
├── pnpm-workspace.yaml
├── changeset/                       # @changesets/cli — version bump + changelog
└── .github/workflows/release.yml    # auto-publish on tag
```

**Versioning policy:** semver, breaking changes → major bump → consumer pin version

**Dependency direction (allowed only ↓):**
```
material-service / eco-service / bom-service / routing-service
        ↓ depend on
master-data-service (via SDK) + identity-service (via SDK) + audit-service (via events)
        ↓
@bdt/types, @bdt/events, @bdt/nest-common (shared lib)
```

> **Rule:** ห้าม service ระดับเดียวกัน (เช่น material → bom) call ตรง — ผ่าน gateway หรือ event bus เท่านั้น

---

## 4. Inter-service Communication

### 4.1 Sync (REST)
- **Frontend → Backend:** เข้า `bdt-gateway` เท่านั้น (1 origin)
- **Service → Service (read):** ผ่าน SDK npm package + REST internal (in-cluster URL `http://material-service:3000`)
- **Auth:** Service-to-service ใช้ short-lived JWT signed by `bdt-identity-service` (mTLS optional ในอนาคต)
- **Timeout/Retry:** SDK ตั้ง default timeout 5s, retry 2 ครั้ง exponential backoff (jitter)
- **Circuit breaker:** ใช้ `@nestjs/terminus` + custom breaker (Sprint 3+)

### 4.2 Async (RabbitMQ)
- **Broker:** RabbitMQ 3.13 (cluster 1 node Sprint 1, scale ภายหลัง)
- **Pattern:** Topic exchange + per-service durable queue
- **Naming:** `<domain>.<entity>.<action>` (เช่น `material.master.created`, `material.master.submitted`, `material.master.confirmed`)
- **Schema:** event payload กำหนดใน `@bdt/events` (JSON + JSON Schema)
- **Consumer:** ใช้ `@golevelup/nestjs-rabbitmq` หรือ `@nestjs/microservices`
- **Outbox pattern:** ทุก service write event ลง `outbox` table ใน transaction เดียวกับ business write → relay job ส่งไป RMQ (guarantee at-least-once)
- **DLQ:** `<queue>.dlq` รับ message ที่ retry เกิน max

### 4.3 ตัวอย่าง Event Map สำหรับ Material Master

| Event | Publisher | Consumers | Trigger |
|---|---|---|---|
| `master.uom.upserted` | master-data | material, audit | seed / admin update |
| `master.product_category.upserted` | master-data | material, audit, eco | seed / admin update |
| `material.master.created` | material | audit, notification | POST /materials |
| `material.master.updated` | material | audit, notification | PATCH /materials/:code |
| `material.master.submitted` | material | audit, notification, eco | action_submit |
| `material.master.confirmed` | material | audit, notification, odoo-sync | action_confirm |
| `material.master.cancelled` | material | audit, notification | action_cancel |
| `material.master.runno_assigned` | material | audit, notification | action_assign_runno |
| `identity.user.created` | identity | audit | new user |

---

## 5. Database-per-Service

### 5.1 Strategy
- 1 Postgres instance ใน Sprint 1 (single container) — **logical database แยกต่อ service**
- Sprint 3+: แยก instance สำหรับ service หนัก (material, audit)

| Service | DB name | Owns tables |
|---|---|---|
| identity | `bdt_identity` | `res_users`, `res_groups`, `res_users_groups_rel` |
| master-data | `bdt_master` | `uom_category`, `uom_uom`, `product_category`, `account_account` |
| material | `bdt_material` | `materials`, `part_code_seq`, `material_outbox` |
| audit | `bdt_audit` | `mail_message`, `mail_followers` (Sprint 2) |
| eco | `bdt_eco` (Sprint 4) | `mrp_eco`, `mrp_eco_stage` |
| bom | `bdt_bom` (Sprint 5) | `mrp_bom`, `mrp_bom_line` |

### 5.2 Cross-service references
- ห้าม FK ข้าม database
- ใช้ **soft reference** (เก็บ id หรือ external code) + denormalize ฟิลด์สำคัญที่ต้องโชว์ (เช่น `categ_name_cache` ใน `materials.attributes`)
- Read-side projection: gateway BFF aggregate (Sprint 2)

### 5.3 ตัวอย่าง: `materials` ใน `bdt_material`
- `categ_id INT NOT NULL` — soft ref ไป `bdt_master.product_category.id` (ไม่มี FK)
- `uom_id INT NOT NULL` — soft ref ไป `bdt_master.uom_uom.id`
- `create_uid INT NOT NULL` — soft ref ไป `bdt_identity.res_users.id`
- ความถูกต้อง: validate ผ่าน SDK call (`master-data-sdk.findUomById`) + cache 5 นาที (LRU in-memory)

---

## 6. Local Development

### 6.1 Repo: `bdt-platform-infra`

```
bdt-platform-infra/
├── docker-compose.yml               # full stack: 5 services + postgres + rabbitmq + verdaccio + traefik
├── docker-compose.minimal.yml       # FE-only dev
├── traefik/
│   └── dynamic.yml                  # routes /api/v1/materials → material-service:3000 ฯลฯ
├── postgres/
│   └── init.sql                     # CREATE DATABASE bdt_identity, bdt_master, ...
├── rabbitmq/
│   └── definitions.json             # exchanges, queues, bindings
├── verdaccio/
│   └── config.yaml                  # NPM private registry
├── seeds/
│   └── dev-data.sh                  # ยิง POST ไป services เพื่อสร้าง dev data
├── env/
│   ├── identity.env.example
│   ├── master-data.env.example
│   ├── material.env.example
│   └── audit.env.example
├── Makefile
└── README.md
```

### 6.2 Commands

```bash
# clone ทุก repo (ใช้ git workspaces หรือ script)
make clone-all                       # clone bdt-* ทั้งหมดลงโฟลเดอร์เดียวกัน

# start infra (DB + RMQ + Verdaccio + Traefik)
docker compose up -d postgres rabbitmq verdaccio traefik

# start service ใดๆ ใน watch mode
cd ../bdt-material-service && pnpm dev

# หรือ start ทุก service ผ่าน compose
docker compose --profile full up

# seed dev data
make seed
```

### 6.3 Service URL (local)
| Service | Internal | Through Traefik |
|---|---|---|
| Frontend | `http://frontend:5173` | `http://localhost/` |
| Gateway | `http://gateway:8080` | `http://localhost/api` |
| Identity | `http://identity:3001` | `http://localhost/api/identity` |
| Master-data | `http://master-data:3002` | `http://localhost/api/master` |
| Material | `http://material:3003` | `http://localhost/api/materials` |
| Audit | `http://audit:3004` | `http://localhost/api/audit` |
| RabbitMQ UI | — | `http://localhost:15672` |
| Verdaccio | — | `http://localhost:4873` |

---

## 7. Production Deployment (Docker Compose / Swarm)

### 7.1 Topology Sprint 1 (single host)

```
┌─────────────────────────────────────────────────────────────┐
│  Docker host (4 vCPU / 8 GB)                                │
│                                                              │
│  Traefik (80, 443) ──┬── frontend (Nginx)                   │
│                      ├── gateway (NestJS)                   │
│                      └── /api/* → ตามต่อ service             │
│                                                              │
│  RabbitMQ (5672, 15672)                                     │
│  Postgres (5432) ── databases: identity, master, material,   │
│                                audit                         │
│                                                              │
│  identity-svc · master-data-svc · material-svc · audit-svc  │
│                                                              │
│  Loki + Promtail (logs) · Prometheus + Grafana (metrics)    │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Sprint 3+ → Swarm cluster
- 3 manager + 3 worker nodes
- Postgres replication (primary + replica)
- RabbitMQ cluster (3 nodes mirrored queues)
- Service replicas: material × 3, master × 2, others × 1

### 7.3 CI/CD per repo (template `.github/workflows/ci.yml`)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: pw } }
      rabbitmq: { image: rabbitmq:3.13-management }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm, registry-url: 'https://npm.bdt.internal' }
      - run: pnpm i --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test:unit
      - run: pnpm test:integration
      - run: pnpm build
  publish:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: docker/build-push-action@v5
        with:
          tags: registry.bdt.internal/material-service:${{ github.sha }},registry.bdt.internal/material-service:latest
          push: true
  deploy:
    needs: publish
    if: github.ref == 'refs/heads/main'
    runs-on: self-hosted
    steps:
      - run: docker stack deploy -c stack.material.yml bdt
```

---

## 8. Sprint 1 Deliverables — มี 8 Repos ที่ต้องสร้าง

> Sprint 1 length = 1 สัปดาห์, 2 dev × 5 days = 80 h capacity (เพิ่มจากเดิม 56 h เพราะมี overhead microservices)

| # | Repo | Sprint 1 Goal | Effort |
|---|---|---|---|
| 1 | **bdt-shared-contracts** | scaffold pnpm workspace + 4 packages: `@bdt/types`, `@bdt/events`, `@bdt/nest-common`, `@bdt/eslint-config` | 6 h |
| 2 | **bdt-platform-infra** | docker-compose.yml ครบ (Postgres, RabbitMQ, Verdaccio, Traefik), seed init | 6 h |
| 3 | **bdt-identity-service** | stub: 1 endpoint `GET /users/me` (return mock user จาก `x-user-id` header) + `res_users` table | 4 h |
| 4 | **bdt-master-data-service** | seed UoM (20) + Product Category (7 ที่ยืนยันแล้ว) + Account; REST `GET /uoms`, `GET /product-categories` (tree); publish `master.*.upserted` events | 8 h |
| 5 | **bdt-material-service** | core ตาม Sprint Plan: POST/PATCH/GET + validators + part-code-gen + outbox publish events | 22 h |
| 6 | **bdt-audit-service** | consume `material.master.*` events → INSERT `mail_message`; expose `GET /messages?model=&res_id=` | 6 h |
| 7 | **bdt-gateway** | Traefik config + simple BFF (NestJS) ที่ aggregate `GET /materials/:code` (call material + audit) | 6 h |
| 8 | **bdt-frontend** | refactor ให้ยิงผ่าน gateway, ใช้ SDK `@bdt/material-sdk` (publish จาก contracts) | 12 h |

**รวม:** 70 h + 10 h buffer = 80 h ✅

### Stretch (ถ้ามีเวลา)
- bdt-eco-service / bdt-bom-service / bdt-routing-service: scaffold เปล่าๆ (README + Dockerfile + healthz) เผื่อ Sprint หน้าหยิบขึ้นมาเขียน
- Add observability stack (Prom + Grafana + Loki)

---

## 9. Sprint 1 Schedule (5 Days, 2 Devs)

| Day | Dev A (BE-heavy) | Dev B (FE + integration) |
|---|---|---|
| **Mon** | scaffold `bdt-shared-contracts` + publish 4 packages → Verdaccio | `bdt-platform-infra` (docker-compose, Traefik, RMQ definitions) |
| **Tue** | `bdt-identity-service` (4h) + `bdt-master-data-service` core (4h) | scaffold `bdt-material-service` (controller + DTO + Prisma) |
| **Wed** | `bdt-material-service` services + validators + part-code-gen + outbox | `bdt-audit-service` (consume events + GET) |
| **Thu** | `bdt-gateway` BFF + Traefik routes + `master-data` events publish | `bdt-frontend` integration: API client + form + ProductList ใช้ SDK |
| **Fri** | E2E test ข้าม services + bug fix | Demo prep + refactor + docs |

**Sprint demo (Fri 14:00):**
1. กด "เพิ่มชิ้นงาน" → form → submit → `bdt-material-service` รับ → publish event
2. `bdt-audit-service` consume event → log
3. UI list refresh → ดึงผ่าน gateway → `material` + `audit` aggregate
4. กด "ส่งให้ตรวจสอบ" → state → `to_approve` → audit อีกรอบ
5. Show RabbitMQ Management UI (queue depth, message rate)
6. Show Traefik dashboard

---

## 10. Cross-cutting Concerns

### 10.1 Security
| Concern | Sprint 1 | Sprint 3+ |
|---|---|---|
| Service-to-service auth | `x-user-id` header (mock) | JWT signed by identity (5-min TTL) |
| External auth | gateway accept `Bearer` mock | OIDC/SSO via identity-service |
| Network isolation | docker bridge default | overlay network + Swarm secrets |
| Rate limit | none | gateway + Redis |
| Secret management | `.env` files | Docker Swarm secrets / Vault |

### 10.2 Observability
| Layer | Tool | Sprint |
|---|---|---|
| Logs | JSON to stdout → Loki | 1 |
| Metrics | Prometheus + Grafana dashboards per service | 2 |
| Tracing | OpenTelemetry → Tempo | 3 |
| Errors | Sentry | 2 |
| Uptime | Uptime Kuma | 1 |

### 10.3 Testing Strategy

| Test type | Owner | Tool | Sprint |
|---|---|---|---|
| Unit | each service | Jest | 1 |
| Integration (DB + RMQ) | each service | Jest + Testcontainers | 1 |
| Contract (consumer-driven) | shared-contracts | Pact | 3 |
| E2E (UI → all services) | infra repo | Playwright + docker-compose-up | 2 |
| Load | infra repo | k6 | 4 |

### 10.4 Data Migration / Backward Compatibility
- Schema migration ของแต่ละ service: `prisma migrate` อัตโนมัติบน startup (dev) / manual `prisma migrate deploy` (prod)
- Event schema versioning: ทุก event มี `version` field; consumer ต้อง handle เก่า + ใหม่ 1 รุ่น
- API versioning: prefix `/api/v1/...` — major change = `v2` route ขึ้นพร้อมกัน

---

## 11. Risks & Mitigations (เพิ่มเติมจาก monolith plan)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Overhead microservices ใน Sprint 1 (ตั้ง 8 repos) | High | High | บีบ scope: `identity` ทำเฉพาะ stub, `audit` ทำเฉพาะ consumer; `eco`/`bom`/`routing` ยังไม่เปิด |
| Dev experience ช้า (compose start ทุก service ครบ) | Medium | Medium | profile `minimal` รัน FE + 1 service; ใช้ `tilt` หรือ `lazydocker` |
| Schema drift ใน shared types | Medium | High | publish `@bdt/types` + เปิด CI ที่ตรวจ peer dep version ทั้ง org (Sprint 2) |
| Event schema breaking | Medium | High | JSON Schema validate ที่ publish + consumer; ห้าม remove field — only deprecate |
| Cross-service transaction (e.g. material + audit ต้องสำเร็จคู่กัน) | Medium | Medium | Outbox pattern + idempotent consumers; ไม่ใช่ 2PC |
| Verdaccio ล่ม → ทุก service build fail | Low | High | Mirror `npmjs.org` upstream + backup; CI cache pnpm store |
| Tracing ระบุ root cause ยากเมื่อข้าม service | Medium | Medium | OpenTelemetry SDK ตั้งแต่ Sprint 1 (แค่ trace context, dashboard มาทีหลัง) |
| RabbitMQ down ตอน publish | Low | Medium | Outbox table + relay → guarantee write |
| ทีมไม่เคยทำ microservices | High | High | Day 1 pair onboarding 1 ชม.; ทุก PR แรกต้อง pair review; แชร์ template repo |

---

## 12. Migration Path จาก Monolith Sprint Plan เดิม

ถ้า Sprint 1 ตามแผนเก่า (ทุกอย่างใน 1 NestJS project) จะกลายเป็น material-service ตัวเดียว — **80% ของโค้ดยังใช้ได้** ไม่ต้องทิ้ง:

| ในแผน monolith | ในแผน microservices |
|---|---|
| `apps/api/src/materials/*` | → ย้ายเป็น `bdt-material-service/src/modules/materials/` |
| `apps/api/src/uom/*`, `product-category/*` | → แยกเป็น `bdt-master-data-service` |
| `apps/api/src/mail/*` | → แยกเป็น `bdt-audit-service` (เปลี่ยนเป็น consumer) |
| `apps/api/src/auth/*` | → `bdt-identity-service` (แค่ย้าย folder) |
| Schema `mail_message` | → ไป `bdt_audit` DB |
| Direct call `mailService.log(...)` | → publish event `material.master.*` แทน |

**Strangler pattern:** ถ้าทีมเริ่มจาก monolith ก่อน 1 sprint แล้วค่อยแยก — Sprint 2 ใช้เวลา 3 วันแยก audit + master ออกได้

---

## 13. Decision Log สำหรับ Microservices Move

| # | Decision | Rationale | Status |
|---|---|---|---|
| MS-01 | Polyrepo (1 repo per service) | independent deploy, ownership ชัด | ✅ |
| MS-02 | NPM private registry (Verdaccio) | shared types versioned + offline-able | ✅ |
| MS-03 | RabbitMQ ไม่ใช่ Kafka | ทีมเล็ก, throughput ไม่สูง, ops ง่ายกว่า | ✅ |
| MS-04 | DB-per-service (logical DB ใน 1 instance Sprint 1) | bounded context ชัดเจน, ลด ops | ✅ |
| MS-05 | Docker Compose / Swarm ไม่ใช่ k8s | overhead k8s สูงเกินสำหรับขนาดทีม | ✅ |
| MS-06 | Outbox pattern + at-least-once | data consistency โดยไม่ต้อง 2PC | ✅ |
| MS-07 | Traefik เป็น edge + gateway แยก (BFF) | edge handle TLS/route, gateway aggregate | ✅ |
| MS-08 | Naming Odoo-compatible ใน DB ทุก service | future Odoo migration 1:1 | ✅ |
| MS-09 | Event naming `<domain>.<entity>.<action>` | predictable + filter-friendly | ✅ |
| MS-10 | OpenTelemetry SDK ตั้งแต่ Sprint 1 | future-proof สำหรับ tracing | ✅ |

---

## 14. Open Questions (ต้องเคลียร์ก่อน Sprint Kickoff)

1. **Container registry:** ใช้ Docker Hub / GitHub Container Registry / self-hosted Harbor?
2. **Domain & TLS:** มี internal DNS แล้วหรือยัง? (`*.bdt.internal`?)
3. **Backup & DR:** policy ของ Postgres backup (Sprint 1 อย่างน้อย daily dump?)
4. **Org permission:** สร้าง 8 repos ใน GitHub org ได้ทันที? หรือต้องของบ?
5. **JWT key management:** Sprint 3 จะทำ — ใช้ Vault / file / env? พรรคพวก/ทีม IT รองรับมั้ย?

---

## 15. Roadmap (รวมทั้ง project)

| Sprint | New repos | Highlight |
|---|---|---|
| **1** | shared-contracts, infra, identity (stub), master-data, material, audit, gateway, frontend (refactor) | end-to-end material registration ผ่าน 5 services + event bus |
| **2** | notification | reviewer flow, approve/reject, email/Line notify, Substitute Part |
| **3** | (no new) | full identity + JWT + RBAC, subgroup เต็ม 13 กลุ่ม, criticality |
| **4** | eco | mrp.eco state machine + version graph + linked to material updates |
| **5** | bom, routing, odoo-sync | BOM tree service, routing/work-center, Odoo XML-RPC bridge |
| **6** | reporting (optional) | aging report, duplicate report, bulk import |

---

*Prepared by: BDT Engineering — Microservices Plan v0.1*
