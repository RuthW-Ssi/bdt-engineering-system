# Security review — Schema cleanup (S38-T16), 2026-10-16

- Branch: `dev-t-schema-cleanup` @ `7d845ee` vs `origin/dev`
- Scope: `backend/prisma/migrations/20261016100000_schema_cleanup_phase1/migration.sql`, `backend/prisma/schema.prisma`, phase-2 SQL (separate PR, scratchpad `phase2/migration.sql`), backup `~/Documents/bdt-db-backups/schema-cleanup-2026-10-16/`
- Reviewer role: security (review-only, OWASP API Top 10 2023)
- Supabase not queried (per instructions) — DB-side claims below are from migrations + backup README.

## Verdict: PASS (2 Low, 3 Info)

## Checks with no finding

- **Audit triggers.** The 3 dropped functions write into history tables that were dropped earlier (`product_routing_override_history`, `routing_activity_template_history`). The live audit trigger `trg_routing_template_history_fn` (`20260429180000_sprint4_3_history_tables/migration.sql`) does not reference `eco_id`, so phase 2 dropping `routing_template_history.eco_id` does not break it. `DROP FUNCTION` has no `CASCADE`, so the migration fails loudly if a trigger still depends on one of these functions. It cannot silently remove an audit trigger. History integrity is unchanged (A09:2021).
- **RLS / grants.** No migration creates policies or grants. Dropping `v_material_*` shrinks the public schema PostgREST exposes. Those views were not `security_invoker`, so they ran as the owner and could bypass RLS on `materials`. Dropping them is a net reduction (API8:2023).
- **New fields in responses.** The only reader of `routing_formula_param` is `activities.service.ts:80-86`. It is a `$queryRaw` tagged template with an explicit column list (already included `name`), behind `JwtAuthGuard` + `routings:view`. `process_category` and `tags` are not returned anywhere. No API3:2023 exposure.
- **Dropped columns.** Nothing in `backend/src` or `frontend/src` references the dropped columns.

## Findings

| # | Sev | Where | Scenario | Route |
|---|---|---|---|---|
| 1 | Low | phase-2 `migration.sql` (whole file) | Supabase is shared by staging + main. If phase 2 runs before **main**'s backend (which still selects these columns) is redeployed, Prisma queries on products/drawing/res_partner/uom fail with 500s. That is an availability issue (API8:2023 misconfiguration). | devops: gate phase 2 on main deploy |
| 2 | Low | backup `supabase-before-drop.json` | The backup has no keys for `products.engineer_hours_act/promoted_*`, `bom_dispatch.welding_coverage_json` or `routing_template_history.eco_id`, and `products_procure` is `null`. The "empty or default" claim was not re-verified, so data loss is possible if it is wrong. | data: run `SELECT count(*) … IS NOT NULL` per column right before phase 2 |
| 3 | Info | backup dir | The backup is a single plaintext copy on a laptop, with no off-site copy. It contains no secrets or PII (APS URNs and partner flags only). | devops |
| 4 | Info | phase1 `migration.sql:28` | `DROP COLUMN active` on `routing_formula_param` loses data only on local or fresh DBs (it is already absent on Supabase). | — |
| 5 | Info | backup README | The view and function DDL is not saved verbatim. It is recoverable from the git migrations and the README description. | — |
