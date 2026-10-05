# QA Sign-off — prod-scheduler (PR #221) + routing-template guards (PR #222), promotion to production

- **features:** `prod-scheduler` (Python scheduler on Cloud Run, NestJS run/board API, Production Schedule page, migration `20261003000000`), `routing-template-guards` (delete 409 guard, operation-template DTO hardening, `write_uid` stamping)
- **tree reviewed:** local branch `release-check-2026-10-04` (`7fc3058`) = `origin/dev` + `origin/main` at review time; diff against the then-current `origin/staging` (`8673549`, an ancestor at review time) = 107 files.
- **date:** 2026-10-04
- **reviewer:** `qa` (review-only). Nothing pushed, merged or deployed by QA; QA did not access the shared DB (the live preflight in Release outcome was run by the owner).
- **qa decision: WARN** — no Critical/High. 3 Medium (need an explicit user OK), 7 Low, 1 INFO row.
- **security decision (read, not overridden):** WARN (Medium findings in scope; tracked separately).
- **approved_for_ship:** YES — owner accepted M-1 .. M-3 on 2026-10-04 ("merge now, set up after"). Shipped; see Release outcome.

## Inputs
- Role card `wiki/tech/roles/qa.md` is missing on this machine (`wiki/tech/` has no `roles/`). Used `.claude/agents/qa.md` + the sign-off format of earlier gates. Notion DoD: not verifiable (`pm/_snapshots/` absent, no Notion access). INFO only.
- Tester wiki summaries exist: `wiki/tech/testing/per-feature/prod-scheduler.md`, `routing-template-guards.md` (checklist item 1 passes).

## Checklist
| # | Item | Result |
|---|---|---|
| 1 | Tester wiki summary exists, both features | PASS |
| 2 | Notion DoD | NOT VERIFIABLE (INFO) |
| 3 | Tests pass, no regressions | PASS, see evidence; wiki understates baseline failures (L-1) |
| 4 | tsc / build | PASS: frontend `tsc -b` 0, `vite build` OK, backend `tsc` 0 |
| 5 | Manual / E2E evidence | PASS. The writer path was listed "not covered"; QA closed it on real Postgres (below) |
| 6 | Migration safety on the shared DB | WARN (M-2): safe in simulation, live preconditions unverified |
| 7 | Deploy workflow ordering | WARN (M-1, L-2) |
| 8 | Rollback path | partial (L-3) |
| 9 | Nothing half-done ships | WARN: Run/Activate ship non-functional until the one-time setup (M-1); stray files (L-4) |
| 10 | Security findings respected | PASS, nothing overridden |

## Evidence (all re-run by QA, not copied from the wiki)
- **Frontend:** vitest 28 files / 282 tests pass; `tsc -b` 0; `vite build` OK.
- **Python:** pytest 39 pass in the tested venv AND in a clean-resolve env (starlette 1.7.0 vs tested 1.3.1).
- **Backend Jest, the 6 feature specs:** 110/110 pass (client 14, schedule.service 53, schedule.controller 17, routings.controller 6, operation-template dto 18, service 2).
- **Backend Jest regression check:** run in isolation (`-w 2`) on `origin/staging` and on the release tree, the failing-test sets are identical: 4 suites / 17 tests (bom-matching 9, cycle-time 6, template-binding 1, project-progress 1), plus a flaky `mo-print-qr` test that failed on staging only. 0 regressions. (The 2026-10-01 sign-off also recorded 17 on the dev baseline.) A full parallel run on this machine adds load-induced timeouts (auth.service, mo-print.*, progress-export), so full-suite pass/fail here is not a reliable signal.
- **Migration `20261003000000`, PG 16.14 scratch DBs:** (A) staging schema -> migration: applies in one transaction, re-run is a no-op, `prisma migrate diff` vs `schema.prisma` = empty. (B) release schema with legacy WIP views -> migration: applies over dependent views, idempotent, drift empty. Synthetic multi-mark data: `wip_event`/`wip_balance` return the hand-computed values (A1 40 m2/400 kg, A2 40 m2/500 kg, level 80/900 at 08:00 then 0; flow vs buffered timing correct).
- **Writer path on real Postgres, as the restricted role:** runbook section 1 SQL applied verbatim, its check queries all false / no rows. Real service run as `sched_writer`: persisted backward run creates `BACKWARD-V1`; re-run overwrites in place (same id, 3 rows not 6); `event + activate` leaves exactly one active version; a non-activating re-run does not steal or lose `is_active`; WO on a work center without a line -> 422 `data_not_ready` with `prod_schedule` + `prod_schedule_version` byte-identical before/after; lock held by another session -> 409 `run_in_progress`, works again after release; Python `LOCK_KEY` = TS `SCHEDULER_LOCK_KEY` = 5999718590924016709. The grants in the runbook are sufficient and nothing more is needed.
- **NestJS raw SQL via the real Prisma client:** BigInt advisory-lock param works (second session gets false while held); stock aggregate returns `with_stock=2 short=1` on seeded data and one row on an empty set; `wip_balance` query executes; `prod_schedule.workcenter_line` include works. `GET /schedule/wo/:id/schedule` keeps `{id, code, name}`, so `WoDetail` is unaffected.
- **Image:** Docker daemon not available (no build). Instead: every pinned dep and transitive dep has a Linux cp313 wheel (incl. `psycopg2-binary` 2.9.12); app boots from the image's exact layout (requirements.txt + app/); `/health` 200, DB failure gives a generic 500 with no DSN/exception text, extra field gives 422.
- **PR #222:** DELETE guard, DTO rules and `write_uid` stamping match the wiki; `OperationBuilder` payload (`time_mode: 'by_activities'`, nulls) passes the DTO; `RoutingBuilder`'s `'activities'` label goes to different DTOs, so the closed `time_mode` set does not affect it; UI shows the 409 message via toast.

## Findings
| ID | Sev | Finding | Route |
|---|---|---|---|
| M-1 | Medium | Shipping both halves of PR #221 in one push contradicts runbook section 0 ("merge as two separate PRs"; setup + first deploy before `SCHEDULER_API_URL`). `deploy-scheduler.yml` will fail at `--set-secrets` (secret does not exist), `deploy-backend.yml:68` already points NestJS at the missing service, so Run returns an error (400 "Scheduler rejected the request" if the service does not exist, 500 if it exists without `run.invoker`). Board/4M/activate-less browsing works. Not data-risky; the Run button is visible to every `orders:update` user meanwhile. | devops + user decision |
| M-2 | Medium | Migration verified only on simulated DBs; live preconditions unverified. It drops/re-adds 3 FKs and `DROP VIEW`s (no CASCADE) on the shared DB. A failure leaves `_prisma_migrations` failed (P3009), which blocks the backend container's `prisma migrate deploy && node dist/main` and the migrate workflow until someone runs `migrate resolve`. Prod keeps serving the old revision, so fail-safe but manual recovery. Old view definitions are not in the repo and are lost by the DROP. Run the preflight below first. | data (owner runs SQL), tester to record in wiki |
| M-3 | Medium | `SCHEDULER_API_URL` plus the first scheduler deploy are one-time manual steps with no automated check; the first persisted run on production data happens only after them. Mitigated by the real-Postgres run above, but the Cloud Run/IAM/secret leg is untested. Verify runbook section 6 (ID-token `/health`, `/schedule/compare`, then one UI run) right after setup. | devops |
| L-1 | Low | Tester wiki says known pre-existing failures = cycle-time + template-binding (7 tests); real baseline is 4 suites / 17 tests (+ flaky mo-print-qr). Also test counts drift: client 14 (wiki 12), operation-template dto 18 (17), service+controller 70 ("~80"). | tester |
| L-2 | Low | `deploy-scheduler.yml` has no `workflow_dispatch`; after the one-time setup the first successful deploy needs "Re-run failed jobs" or a push touching `backend-schedule/**`. Runbook section 3 does not mention re-run. Add `workflow_dispatch:` and one line in the runbook. | devops |
| L-3 | Low | Runbook section 7 covers rollback of the scheduler revision only. Add a short release rollback note: backend = Cloud Run traffic to previous revision (safe: new columns have defaults/are nullable, migration is additive/idempotent); migration needs no rollback; old WIP views cannot be restored from the repo (save `pg_get_viewdef` first, preflight item 3). | devops |
| L-4 | Low | Stray / stale files in the shipped tree: `backend-schedule/sql/last_test_output.sql` (committed DELETE of `prod_schedule` + hardcoded June IDs, referenced by nothing), `docs/superpowers/specs/2026-06-26-cockpit-4m-wip-analysis-design.md` (spec for the deleted cockpit), `backend-schedule/HANDOFF.md:78` (cockpit note: the consumer is gone). `.claude/launch.json` is untracked: devops must `git add` explicit paths. | backend / data |
| L-5 | Low | Migration header says it "creates it where it does not (a fresh/local DB)" and is "safe on both". False for a history-only DB: history cannot be replayed from empty (`20260622060000_mock_activity_labor` needs seed rows; `20260922040000_team_and_operator_team_id` needs a `subcontractor` table created outside history), so it fails with `relation "team" does not exist`. Pre-existing drift, not a live-DB risk; fix the comment. | data |
| L-6 | Low | Runbook troubleshooting row (`prod-scheduler-deploy.md:288`): "NestJS 400 ... lacks run.invoker". The client maps IAM 401/403 to 500 (per ADR-0015); 400 is any other 4xx such as 404 (wrong URL / service missing). | devops |
| L-7 | Low | Transitive Python deps unpinned: a clean image build resolves starlette 1.7.0 while dev/tests used 1.3.1 (39 tests pass on both). Pin via a constraints/lock file. | backend |
| INFO | - | No CI workflow runs tests, `tsc` or lint before deploy (pre-existing); manual evidence is the only gate. Wiki cascade (features/api/data-model/decisions for stock_quant, WIP views, ADR-0015, guards) is still pending (post-ship step 6.1). Role card path missing. Notion DoD not verifiable. | devops / wiki-integrator |


## Preflight SQL (read-only, Supabase SQL editor, run before the merge)
```sql
-- all three must be 0 (the migration re-adds these FKs and validates every row)
SELECT count(*) FROM prod_schedule ps LEFT JOIN mrp_workcenter_line l ON l.id = ps.workcenter_line_id WHERE ps.workcenter_line_id IS NOT NULL AND l.id IS NULL;
SELECT count(*) FROM mrp_workcenter_line l WHERE l.subcontractor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM team t WHERE t.id = l.subcontractor_id);
SELECT count(*) FROM stock_quant s WHERE NOT EXISTS (SELECT 1 FROM materials m WHERE m.id = s.material_id);
-- must return no rows (DROP VIEW has no CASCADE; a dependent view makes the migration fail)
SELECT DISTINCT dep.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class dep ON dep.oid = r.ev_class JOIN pg_class src ON src.oid = d.refobjid WHERE src.relname IN ('wip_event','wip_balance') AND dep.relname NOT IN ('wip_event','wip_balance');
-- save the output: these old definitions are not in the repo
SELECT viewname, definition FROM pg_views WHERE schemaname = 'public' AND viewname IN ('wip_event','wip_balance');
-- must return no rows (a failed migration blocks every migrate deploy)
SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
```

## Recommended order (resolves M-1, M-3)
1. Run the preflight SQL. 2. Do runbook sections 1 and 2 (role `sched_writer`, secret, `secretAccessor`) BEFORE merging, so the first `deploy-scheduler` run succeeds. 3. Fast-forward `staging`; expect Vercel, `deploy-backend`, `migrate-deploy`, `deploy-scheduler`. 4. Section 4 (`run.invoker` for the NestJS SA) right away. 5. Section 6 verification, then one UI run as an `orders:update` user (writes `BACKWARD-V1`).
If the user prefers to merge first: accept a red `deploy-scheduler` run and a failing Run button, then do sections 1, 2, re-run the failed job, section 4, section 6.

## Release outcome (2026-10-04)
- **Owner decision:** merge first, one-time setup after (the second path above).
- **Preflight on the live DB (read-only), closes M-2:** the three orphan counts are 0; no objects depend on `wip_event` / `wip_balance`; neither view existed before the migration, so nothing was lost by the DROP; no unfinished rows in `_prisma_migrations`.
- **Merges:** #223 (`main` → `dev`), #224 (`dev` → `staging`, production, `d5a219d`), #225 (`staging` → `main`). `main`, `dev` and `staging` end on the same tree, identical to the tested release tree.
- **Deploys on `d5a219d`:** Vercel `bdt-engineering-system` (production frontend) success; the legacy `bdt-app` Vercel project reported failure on the same commit, as on every PR since #219 · `Prisma Migrate Deploy` success (migration `20261003000000` finished) · `Deploy Backend to Cloud Run` success · `Deploy Prod Scheduler to Cloud Run` failed as expected at `--set-secrets` (secret not created yet). Image build and push succeeded, so the Docker build is now verified on CI (part of M-3).
- **Smoke (no auth):** `GET /api/v1/schedule/board`, `GET /api/v1/schedule/board/fourm`, `POST /api/v1/schedule/runs` → 401; unknown route → 404 (routes deployed and guarded).
- **Open:** runbook §1, §2, re-run the failed `deploy-scheduler` job, §4, then §6 and one UI run (M-1, M-3). Security follow-ups are tracked separately. Low findings L-2 .. L-7 not yet routed.
