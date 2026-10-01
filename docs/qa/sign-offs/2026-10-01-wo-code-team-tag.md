# QA Sign-off — WO code IN/EX team tag + team_type lock

- **feature:** `wo_code` = `WO-IN-YYNNNNNN` / `WO-EX-YYNNNNNN` from the chosen team's `team_type` (one per-year counter for both types); data migration `20261001120000_wo_code_team_tag` renames existing codes. `team_type` can't change once the team has work orders (409), so a code's tag can't contradict its team.
- **commits:** `b3c9d06` (code tag + migration), team_type lock in the next commit on `dev-t-wo-code-team-tag`
- **date:** 2026-10-01
- **qa decision:** not run. User: "จัดการเลย", accepting the offer to merge dev → staging → main like the previous feature (/release-gate skipped)
- **security decision:** not run (same waiver)
- **approved_for_ship:** true · **forced_ship:** true
- **migration:** data-only UPDATE, idempotent (`WHERE wo_code ~ '^WO-[0-9]{8}$'`); no schema change. Read-only Supabase check: 3 WOs, all with internal teams → `WO-IN-26000001..03`.
- **evidence:**
  - backend jest: 1047 tests, the same 17 pre-existing failures as the `origin/dev` baseline, 0 new; wo-auto-create + machines specs cover IN/EX and the lock
  - frontend vitest 177/177; `pnpm run build` passes
  - migration dry-run in a rolled-back transaction (EX path; re-run = UPDATE 0); applied locally
  - live API on a restored DB snapshot: external team → `WO-EX-26000006`, internal → `WO-IN-26000007`; PATCH team type on a team with WOs → 409, nothing written
  - review: 2 lenses + adversarial verify, 4 Low confirmed. The team_type finding is fixed by the lock. The deploy-window race is handled with a read-only check after deploy. `seed-wo.ts` is already broken.

## Follow-ups
- After staging deploy: read-only `SELECT … WHERE wo_code ~ '^WO-[0-9]{8}$'`. If any rows come back, re-run the idempotent UPDATE, but only with the user's confirmation.
