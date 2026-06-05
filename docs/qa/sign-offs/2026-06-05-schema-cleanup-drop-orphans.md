# QA Sign-off · schema-cleanup-drop-orphans

_Date: 2026-06-05 · Feature: T-DROP-ORPHAN.01 · Branch: dev-t-drop-orphan_
_QA subagent · /release-gate run_

---

## Decision

**WARN → PASS (user override)**
**approved_for_ship:** true
**user_overrode:** true
**user_override_notes:** F-01 resolves on push (pre-push state expected). F-02/F-03/F-04/F-05 accepted as known Medium gaps for schema migration task. Tao confirmed proceed 2026-06-05.

> One High finding (F-01: CI not run — branch not pushed) + four Medium findings.
> The High finding has a clear, acknowledged pre-condition (staging backup required before push).
> Proceeding to WARN rather than BLOCK because the gap is operational (not a code defect),
> the implementation evidence is strong (tsc 0 errors, 7/7 smoke PASS, correct migration SQL),
> and the fix route is unambiguous (devops pushes branch → CI runs → confirm green).
> **User must confirm acceptance before devops proceeds.**

---

## Checks performed

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Notion task DoD all checked | PASS | Tester DoD coverage map 14/14 PASS; matches task brief criteria |
| 2 | Wiki test summary exists at correct path with current date | PASS | `wiki/tech/testing/per-feature/schema-cleanup-drop-orphans.md` · dated 2026-06-05 |
| 3 | Wiki summary DoD coverage map = 100% PASS | PASS | All 14 criteria ✅ in coverage map |
| 4 | Raw test report file exists in `docs/test-scripts/` | FAIL (Medium) | No `schema-cleanup-drop-orphans/` folder · no dated report file → F-02 |
| 5 | Backend coverage on changed files (90% svc · 80% ctrl) | FAIL (Medium) | No `coverage-summary.json` · pure migration, no new logic · documented exemption in wiki known gaps → F-03 |
| 6 | CI on branch is green | FAIL (High) | Branch not pushed · no CI run exists → F-01 |
| 7 | Wiki diff present for changed area | PASS (with caveat) | `data-model.md` updated 2026-06-05; orphan drop documented. Two count discrepancies (49 vs 51 models; 25 vs 23 tables) → F-05 (Medium) |
| 8 | Manual test evidence (user-provided) | PASS | 7 endpoints × 200 response documented in wiki test summary, dated 2026-06-05 |
| 9 | Smoke test / E2E (if suite exists) | FAIL (Medium) | E2E suite exists in `backend/test/e2e/`; not run post-migration → F-04 |
| 10 | No active BLOCK from security subagent | PASS | `docs/security/findings/` has no entry for this feature; only 2026-06-04-dashboard.md present |

---

## Findings

| ID | Severity | Summary | Fix route |
|---|---|---|---|
| F-01 | High | CI not green — branch not pushed to remote | devops |
| F-02 | Medium | No raw test report in `docs/test-scripts/schema-cleanup-drop-orphans/` | tester |
| F-03 | Medium | No coverage artefact (`coverage-summary.json` missing) | tester |
| F-04 | Medium | E2E suite exists but not run post-migration | tester |
| F-05 | Medium | Wiki data-model.md model count wrong (49 stated, 51 actual; 25 tables stated, 23 actual) | wiki-integrator |

Full finding detail: `docs/qa/findings/2026-06-05-schema-cleanup-drop-orphans.md`

---

## Implementation evidence (verified)

- `schema.prisma`: 51 models remaining (was ~74 pre-migration)
- `migration.sql`: exactly 23 `DROP TABLE` statements confirmed
- `master-data.service.ts`: `include: { category: true }` and `include: { account: true }` removed; `orderBy: [{ category_id: 'asc' }]` removed — clean
- `tsc -b`: 0 errors (per task brief + tester confirmation)
- Smoke endpoints: 7/7 → 200 (GET /materials, /products, /dispatches, /uoms, /product-categories, /dispatches/33/paint-config, /dispatches/33/welding-config)
- E2E spec files checked: no references to dropped model names (no regression risk in existing specs)
- Security findings: none for this feature

---

## Pre-ship requirements (before devops proceeds)

1. **[Required]** Push branch → confirm CI green on `dev-t-drop-orphan` (resolves F-01)
2. **[Required]** User confirms acceptance of Medium findings F-02, F-03, F-04, F-05

Mediums are recommended but not blocking if user accepts risk:
- F-02: tester writes `docs/test-scripts/schema-cleanup-drop-orphans/*-test-report-2026-06-05.md`
- F-03: tester regenerates coverage artefact or formally documents migration exemption
- F-04: tester runs `npm run test:e2e` locally, documents result
- F-05: wiki-integrator corrects `data-model.md` model count (49→51) and table count (25→23)

---

## Approval

- **approved_for_ship:** false (pending CI green + user confirmation)
- **user_overrode:** false
- **decision:** WARN
- **qa_agent:** QA subagent · /release-gate · 2026-06-05
