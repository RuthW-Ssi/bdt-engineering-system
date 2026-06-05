# QA Findings · schema-cleanup-drop-orphans

_Date: 2026-06-05 · Feature: T-DROP-ORPHAN.01 · Branch: dev-t-drop-orphan_
_QA subagent dispatched by /release-gate · review-only_

---

## F-01 · CI not green (branch not pushed)

- **where:** `gh run list --limit 1 --branch dev-t-drop-orphan` → no output (branch not pushed to remote)
- **what:** No CI run exists for `dev-t-drop-orphan`. Branch is local-only. CI green is a required gate before ship.
- **severity:** High
- **evidence:** CI command returned empty output. `git status` confirms branch is ahead of remote (no upstream). This is noted as a known pre-condition ("branch not pushed yet") but is not waived by QA — it is a blocker until CI confirms build/lint pass post-push.
- **fix_route:** devops — push branch, confirm CI green before proceeding to commit/merge

---

## F-02 · No raw test report file in `docs/test-scripts/`

- **where:** `docs/test-scripts/` — only `bom_upload/` subdirectory exists. No `schema-cleanup-drop-orphans/` or equivalent folder.
- **what:** Tester role is expected to produce a dated raw test report in `docs/test-scripts/<feature>/`. Only the wiki summary exists; no standalone `*-test-report-2026-06-05.md` file.
- **severity:** Medium
- **evidence:** `find docs/test-scripts -name "*orphan*" -o -name "*schema-cleanup*"` → no results. Prior feature (bom_upload) has `bom-diff-test-report-2026-05-13.md` as the pattern.
- **fix_route:** tester — create `docs/test-scripts/schema-cleanup-drop-orphans/<date>-test-report-2026-06-05.md` with scenario results

---

## F-03 · No coverage data (no `coverage-summary.json`)

- **where:** `backend/coverage/coverage-summary.json` — file does not exist
- **what:** Cannot verify 90% service / 80% controller thresholds. No unit tests were written for this feature (structural migration with no new business logic — noted as acceptable in wiki known gaps).
- **severity:** Medium (mitigated by nature of change — pure migration, no new code paths)
- **evidence:** `cat backend/coverage/coverage-summary.json` → file not found. Wiki known gaps explicitly states "No unit tests — schema migration is a structural change with no new business logic."
- **fix_route:** tester — re-run `npm run test:cov` to regenerate coverage artefact; or formally document coverage exemption for pure migration tasks in the tester DoD

---

## F-04 · E2E suite not run for this feature

- **where:** `backend/test/e2e/` — suite exists (materials.e2e-spec.ts, bom-drawings.e2e-spec.ts, sprint4_2, sprint4_3)
- **what:** E2E (NestJS integration) suite exists but no evidence it was executed against the post-migration schema. The materials.e2e-spec.ts is directly relevant (materials endpoint was in smoke list).
- **severity:** Medium
- **evidence:** E2E spec files present. Wiki test summary lists only curl-based smoke tests (7 endpoints). No mention of running `npm run test:e2e` against local backend after migration applied.
- **fix_route:** tester — run `npm run test:e2e` locally, add result to test report; confirm no regressions in materials + related endpoints

---

## F-05 · Wiki data-model.md model count inconsistency (two discrepancies)

- **where:** `wiki/tech/data-model.md` line 4 — header reads "49 active models". Actual `schema.prisma` has 51 models (`grep -c "^model "` → 51). Wiki cleanup note also states "25 orphan tables dropped" while `migration.sql` has exactly 23 `DROP TABLE` statements.
- **what:** Two numeric discrepancies in the wiki:
  1. Header: 49 active models stated, 51 actual
  2. Cleanup note: 25 orphan tables stated, 23 actual (test spec correctly says 23)
- **severity:** Medium (wiki drift — future contradiction risk per heuristic #3)
- **evidence:** `grep -c "^model " backend/prisma/schema.prisma` → 51. `grep "49 active" wiki/tech/data-model.md` → matches. `grep -c "DROP TABLE" migration.sql` → 23. `data-model.md` line 7-8 states "25 orphan tables".
- **fix_route:** wiki-integrator — correct `data-model.md` header to "51 active models" and cleanup note to "23 orphan tables dropped"

---

_No findings at Critical severity. All High findings (F-01) must be resolved before ship. Mediums (F-02, F-03, F-04, F-05) may proceed with user acknowledgement._
