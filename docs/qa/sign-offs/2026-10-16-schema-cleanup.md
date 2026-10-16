# Release gate sign-off · schema-cleanup (2026-10-16)

Branch `dev-t-schema-cleanup` → `dev` (phase 1). Phase 2 (`20261016110000_schema_cleanup_phase2`, column drops) ships as a separate PR. Reviewers: qa + security as separate general-purpose agents loaded with the role cards.

| Reviewer | Verdict | Findings |
|---|---|---|
| qa | WARN | F1, F2 Medium (phase-2 rollout gates) · F3, F4 Low — `docs/qa/findings/2026-10-16-schema-cleanup.md` |
| security | PASS | 2 Low · 3 Info — `docs/security/findings/2026-10-16-schema-cleanup.md` |

## Handled
- **QA F3** — leftover APS / mBOM-coverage comments removed from `schema.prisma`.
- **QA F1 / Security L1** — phase 2 waits until phase 1's backend is live. There is ONE backend (`deploy-backend.yml` runs on push to `staging`; `vercel.json` routes main's `/api` to the same Cloud Run service), so "live on staging" = "live for main".
- **QA F2 / Security L2** — before the phase-2 PR: read-only Supabase check of `pg_depend` / views on the dropped columns + non-null counts per column.
- **QA F4** — user approved shipping ("merge ขึ้นได้เลย"); evidence = local API sweep with phase 1 + 2 applied (tester summary).

## Evidence
- Backend jest 17 failures = baseline · vitest 381/381 · `nest build` · `prisma validate`.
- Local smoke after phase 1 + 2: products (by code/spec/messages), uoms, customers (+PATCH), drawings, dispatches, routing-formula-params, routing-templates (+PATCH, trigger history), materials, MO, WO, operation-templates — all 200.
- Backup of dropped values: `~/Documents/bdt-db-backups/schema-cleanup-2026-10-16/`.

Verdict: **PASS for phase 1** — ship. Phase 2 after the gates above.
