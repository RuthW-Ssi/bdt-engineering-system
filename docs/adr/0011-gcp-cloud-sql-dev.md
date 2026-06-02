# ADR-0011 — GCP Cloud SQL as Shared Dev Database

**Date:** 2026-05-07
**Status:** Superseded (2026-05-20) — see banner below
**Sprint:** 5 (Infra)

> [!warning] Superseded 2026-05-20
> The dev Cloud SQL instance (`dev-bdt-engineering-db`) was **deleted**. Local dev
> returned to **Docker Compose Postgres**, and the staging DB moved to **Supabase
> Free PG 16**. Backend still runs on GCP Cloud Run + Secret Manager. This ADR is
> kept for history; for the current setup see the wiki `ops/infra.md`.

---

## Context

Through Sprint 1–4, each developer ran a local Docker Postgres container. This created a
persistent pain: whenever a machine was swapped or rebuilt, the seed data did not carry over.
Developers had to re-run the full seed pipeline (xlsx importers, routing templates, formula
params — ~1,000 rows) before they could work. With the codebase growing in schema complexity
(28 models, 9 migrations, JSONB fields, history tables), the re-seed cost was escalating.

The decision was made to move the dev database to a cloud-hosted, shared instance so that all
developers connect to the same pre-seeded DB regardless of local machine state.

Ten architectural decisions were made in Sprint 5 to define the target setup.

---

## Decisions

### D1 — Cloud provider: GCP Cloud SQL (Postgres 16)

BDT runs on GCP (SSI project). Cloud SQL is the GCP-native managed Postgres offering —
no cluster admin, no vacuum tuning, built-in PITR and automated backups. Postgres 16 matches
the version used in local development, ensuring Prisma migration compatibility.

*Alternatives considered: self-managed Postgres on GCE (more ops overhead), AWS RDS (cross-cloud
billing complexity, SSI already committed to GCP), Supabase (free tier limits, less IAM integration).*

### D2 — Region: asia-southeast1 (Singapore)

Nearest GCP region to the Bangsaphan plant (Gulf of Thailand). Existing SSI GCP resources are
already in this region, keeping traffic within the same VPC perimeter and minimising egress cost.

### D3 — DB topology: single shared dev DB instance

The core problem is per-machine seed state. A single shared DB eliminates it: one authoritative
seeded DB that all developers read from. Per-dev instances would re-introduce isolation at the
cost of coordination (each dev maintains their own seed + migration state).

Trade-off: a migration pushed by one developer immediately affects the other's working session.
Mitigated by the convention: run `prisma migrate status` before merging and squash migrations
before push.

### D4 — Instance tier: db-f1-micro (~1,500 THB/mo cap)

Dev workload is low-QPS (2–4 concurrent connections). db-f1-micro (shared-core, 0.6 GB RAM)
is the smallest paid tier and fits within the BDT budget ceiling of 1,500 THB/month. A budget
alert at 80% / 100% of this cap triggers an email to the BDT lead (IS16).

Not suitable for load testing or CI parallelism — accepted constraint for dev-only scope.

### D5 — GCP project: existing SSI project (BDT lead = Owner)

The BDT lead holds GCP Owner on the existing SSI project. Creating a new project would require
re-establishing IAM, billing linkage, and VPC peering. Reusing the existing project is the
lowest-friction path. Cloud SQL client roles are scoped per-resource, so other SSI resources
in the same project are unaffected.

### D6 — Migration sync: `prisma migrate deploy` via GitHub Actions on push to main

A single shared DB requires exactly one migration run per schema change. Triggering
`prisma migrate deploy` from GitHub Actions on push to `main` is the canonical trigger:
migrations execute once, in order, without developer intervention. The workflow uses the
Cloud SQL Auth Proxy (sidecar container) to connect securely from CI.

A pre-deploy gate (`prisma migrate diff`) flags `DROP` and `RENAME` operations before they
are applied, giving the developer a chance to review destructive changes.

### D7 — Connection method: Cloud SQL Auth Proxy

The Auth Proxy is the GCP-recommended approach for connecting to Cloud SQL from clients that
lack a static IP. It establishes an encrypted tunnel authenticated via IAM, eliminating the
need to manage SSL certificates or expose a public IP with IP allowlisting.

For local development, the proxy runs as a foreground process via `scripts/proxy-up.sh`.
The backend connects to `127.0.0.1:5432` (proxy endpoint) using standard Postgres credentials.

*Alternative: public IP + authorized networks (simpler but requires managing IP allowlists per
developer machine and exposes the instance publicly). Accepted as a fallback if the proxy
cannot be installed on a Windows dev machine.*

### D8 — Secret management: GCP Secret Manager + .env loaded at runtime

`DATABASE_URL` contains credentials that must not be committed to the repository. GCP Secret
Manager is the native secret store for the SSI GCP project. The script `scripts/setup-env.sh`
fetches the secret at dev setup time and writes it to `backend/.env` (gitignored). The backend
application itself continues to read `DATABASE_URL` from the environment — no SDK dependency
added to the application layer.

### D9 — Seed strategy: one-shot seed on cloud, devs connect to live DB

Reference data (material categories, product templates, mark prefixes, Tekla mappings, steel
grades, routing templates) is stable between sprints. Seeding once on the shared cloud DB means
all developers work from the same baseline state. Subsequent schema changes are handled by
`prisma migrate deploy`; the seed data persists via PITR-backed automated backups.

This replaces the Sprint 1–4 pattern where each developer ran the full seed pipeline locally.

### D10 — Local DB fallback: removed — cloud-only

Keeping docker Postgres alongside Cloud SQL would create two sources of truth and re-introduce
the machine-state problem (which `.env` is active?). Removing the `postgres` service from
`docker-compose.yml` enforces cloud-only: the dev environment is always connected to the shared DB.

Accepted trade-off: offline development is no longer supported. This is documented in
`docs/onboarding/dev-setup.md` and treated as an accepted constraint for a plant-infrastructure
tool that requires internet access during normal operation.

---

## Implementation notes (Sprint 5 actuals vs plan)

| Item | Planned | Actual |
|---|---|---|
| Instance name | `bdt-dev-postgres` | `dev-bdt-engineering-db` (pre-provisioned) |
| Postgres version | 16 | 18 (existing instance) |
| Instance tier | db-f1-micro | db-perf-optimized-N-8 (existing) |
| Auth method | IAM database auth | Password auth via proxy + personal ADC (`gcloud auth application-default login`) |
| DB name | `bdt_dev` | `dev-bdt-engineering-db` |
| Connection name | `building-technology-493907:asia-southeast1:bdt-dev-postgres` | `building-technology-493907:asia-southeast1:dev-bdt-engineering-db` |

The deviations are operational, not architectural — the pattern (Auth Proxy, shared DB,
cloud-only, GH Actions CI) is unchanged.

---

## Consequences

### Positive

- **Portability solved:** any developer clones the repo, runs `scripts/proxy-up.sh`, and
  connects to a fully seeded DB immediately — no re-seed.
- **Single migration authority:** GitHub Actions is the only process that runs `migrate deploy`,
  eliminating migration drift between machines.
- **Cost-controlled:** db-f1-micro + 1,500 THB/mo budget alert.
- **Audit-ready:** PITR + 7-day backup retention covers accidental data loss in dev.

### Negative / Trade-offs

- **Internet required:** dev sessions require a live connection to Cloud SQL via the proxy.
  Offline-only work is blocked.
- **Shared DB collision risk:** two developers running conflicting migrations simultaneously
  can corrupt the shared state. Convention-based mitigation (migrate-status check + squash).
- **Proxy process overhead:** developers must remember to start `scripts/proxy-up.sh` before
  the backend. Forgetting results in a `P1001` error until the proxy is started.
- **IAM complexity:** initial setup (gcloud ADC, Cloud SQL Client role) has more steps than
  `docker compose up`. Covered by `docs/onboarding/dev-setup.md`.

---

## Alternatives considered

### Self-managed Postgres on GCE

Full control over config and version. Rejected: requires OS patching, vacuum tuning, manual
backup setup. Cloud SQL manages all of this for ~1,500 THB/mo — acceptable cost for zero ops.

### Per-developer Cloud SQL instances

Eliminates shared-DB collision risk. Rejected: each dev would still need to seed independently
(re-introduces the original problem). Cost also scales with team size.

### Docker Postgres with volume sync (e.g., mounted NFS/GCS FUSE)

Technically feasible. Rejected: adds NFS/FUSE dependency, complex failover, no PITR. Cloud SQL
is strictly simpler for the use case.
