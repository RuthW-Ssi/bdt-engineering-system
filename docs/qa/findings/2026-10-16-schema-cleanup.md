# QA findings — schema cleanup (S38-T16) · 2026-10-16

Branch `dev-t-schema-cleanup` @ 7d845ee (phase 1) + uncommitted phase 2 `scratchpad/phase2/migration.sql`.
Decision: **WARN** (no code-level runtime break found; two rollout gates must be honoured).

## Verified clean
- No tracked reference (backend/src, src/, backend-schedule python, prisma/*.ts seeds, scripts) to any removed column/table/view/function; origin/dev code never used the phase-1 objects either, so the old container is safe during phase-1 rollover.
- Only raw SQL on an affected table: `activities.service.ts:80-84` — explicit column list (`name` kept). No `SELECT *` / column-less `INSERT` on affected tables.
- Every NOT NULL column removed from Prisma has a DB default in migrations (`factor`, `uom_type`, `procure_method`, `routing_view`, `is_company`, `customer_rank`) → Prisma inserts keep working between phase 1 and 2.
- Fresh DB: trigger tables were dropped in `20260607200000_drop_sprint4_routing`, so `DROP FUNCTION` (no CASCADE) succeeds; all drops use IF EXISTS; `tags` ADD+UPDATE+SET NOT NULL is safe.
- Phase 2: `products_promoted_from_id_fkey` and `routing_template_history_eco_id_idx` are dropped automatically with their columns.
- Local DB (phase 1+2 applied): no function body / view references a dropped name; `prisma migrate diff` DB→schema shows no drift on affected tables.

## Findings

### F1 — Phase 2 must wait for phase 1 on **main**, not just staging
- where: phase2/migration.sql (whole file); tester summary "Why two phases"
- what: Supabase is shared. If phase 2 merges to staging while main's Cloud Run still runs pre-phase-1 code, production Prisma SELECTs `products.procure_method`, `drawing.aps_urn`, `res_partner.customer_rank`, `uom_uom.factor`… → 500 on products/drawings/customers/UoM endpoints in prod.
- severity: Medium (High if ignored)
- evidence: gate text says only "after phase 1 is deployed"
- fix_route: devops — gate phase-2 PR on phase 1 live on staging AND main.

### F2 — Supabase-only dependants not checked for phase 2
- where: phase2/migration.sql (`DROP COLUMN` without CASCADE)
- what: tester checked FKs + `trg_routing_template_history_fn`, not `pg_depend` views. A Supabase-only view (scheduler session created objects outside migrations, HANDOFF.md:79-84) on `products`/`res_partner`/`uom_uom` would make migrate deploy fail mid-file (Prisma doesn't wrap in a txn) → failed migration blocks every later deploy until `migrate resolve`.
- severity: Medium
- fix_route: data — run a read-only `pg_depend`/`pg_views` check on Supabase before the phase-2 PR.

### F3 — Orphan comments left in schema.prisma
- where: backend/prisma/schema.prisma:575-578 (APS block), bom_dispatch "mBOM coverage" comment
- severity: Low · fix_route: be

### F4 — Branch not pushed, no CI run; manual-test evidence = tester's local API sweep only
- severity: Low (info) · fix_route: devops / user
