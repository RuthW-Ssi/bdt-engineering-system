# QA Sign-off — F-Login Error Handling
_Date: 2026-07-02 · Branch: dev-t-login-error-handling (local only, not yet pushed) · Sprint 18_

## decision: PASS

## approved_for_ship: true

## user_overrode: false

---

## Checks performed

| # | Check | Target | Result |
|---|---|---|---|
| 1 | Notion task DoD all checked | 100% | PASS — T-S18.01–04 all Status=Done with Completion Notes; Feature "F-Login Error Handling" Status=Done. Notes honestly disclose 2 mid-branch security fixes (26011d0, 35694c8), both resolved with regression tests. |
| 2 | Wiki test summary exists | exists · current date | PASS — `wiki/tech/testing/per-feature/login-error-handling.md`, mtime 2026-07-02 10:14, self-spec mode (no pre-spec existed, disclosed in file header). |
| 3 | Wiki summary DoD coverage map = 100% PASS | all ✅ | PASS — all 10 DoD rows show ✅ pass, each tied to a specific test or manual scenario. |
| 4 | Raw test report exists with current date | latest | N/A (documented exemption) — feature doesn't meet `bdt-app/CLAUDE.md` §6 test-skill criteria (no computed/diffed data); wiki summary + plan explain why. Re-run commands given instead (`npx jest auth.service.spec.ts`, `npx tsc -p tsconfig.app.json`) and independently reproduced by QA. |
| 5 | Backend coverage on changed files | 90% svc · 80% ctrl | Low finding (F-01) — 84%/80%/75%/86.36% (stmts/branch/funcs/lines), reproduced independently (`cd backend && npx jest auth.service.spec.ts --coverage --collectCoverageFrom='modules/auth/auth.service.ts'`, 4/4 pass). Gap is the pre-existing, unchanged `getProfile()` method (lines 50-55); `login()` itself — including both new logging branches — is fully covered. |
| 6 | CI on branch is green | ✅ | N/A — branch is local only, has not been pushed to origin yet (push happens at `/release-gate` Step 5, after this review, per explicit dispatch instructions). Not treated as a red flag. |
| 7 | Wiki diff present for changed area | non-empty | Low finding (F-02) — `wiki/tech/backend/decisions.md` / `wiki/tech/frontend/decisions.md` / a prospective `wiki/features/error-handling.md` have no update yet. This is expected: per `bdt-app/CLAUDE.md` §5.2, decisions/features wiki updates are Step 6.1 of the post-ship docs cascade (`wiki-integrator`, after commit/push) — not a pre-push gate item. The tester's wiki **test** summary (item #2, QA's mandatory artifact) is present and current. |
| 8 | Manual test evidence (user-provided) | exists | PASS — user personally tested all 4 scenarios in-browser (wrong password, backend killed to simulate down, short password, correct login + welcome toast) and confirmed "เรียบร้อยดีทุก case" (all cases fine) in chat, 2026-07-02. Each scenario is matched 1:1 against a DoD row in the wiki summary's coverage map. |
| 9 | Smoke test (if playwright exists) | all green | N/A — no Playwright/E2E suite exists in this repo for this flow (confirmed via wiki summary + repo check). |
| 10 | No active BLOCK from security subagent | clear | PENDING/DEFERRED — `security` subagent is dispatched in parallel per `/release-gate`; its result is not visible within this QA run. Per role card, QA cannot override or pre-empt security's finding — final aggregation happens at the `/release-gate` orchestrator level. Two security fixes already landed mid-branch (see check #1) are a positive signal but do not substitute for the live parallel security pass. |

---

## Findings

- [F-01 · LOW] `auth.service.ts` whole-file coverage below 90% svc target, gap is pre-existing untested `getProfile()` → `docs/qa/findings/2026-07-02-login-error-handling.md#f-01`
- [F-02 · LOW] Wiki decisions/features pages not yet updated — correctly deferred to post-ship cascade (Step 6.1) → `docs/qa/findings/2026-07-02-login-error-handling.md#f-02`

---

## Decision rationale

PASS. All items with real gating power (Notion DoD, wiki test summary + DoD coverage map, manual test evidence) are fully satisfied and independently re-verified:

- Reproduced `npx jest auth.service.spec.ts --coverage --collectCoverageFrom='modules/auth/auth.service.ts'` myself → 4/4 pass, coverage numbers match the wiki summary exactly.
- Read `backend/src/modules/auth/auth.service.ts`, `src/context/AuthContext.tsx`, `src/pages/LoginPage.tsx`, `src/lib/getErrorMessage.ts` directly — confirmed the two disclosed security fixes (no raw `AxiosError`/password logging in `AuthContext.tsx`; `sanitizeForLog()` in `auth.service.ts`) are actually present in the code, not just claimed.
- Fetched all 5 Notion pages (Sprint 18, Feature, T-S18.01–04) directly — Status=Done + substantive Completion Notes on every one, including honest disclosure of both mid-branch security fixes and why the per-task reviewers missed them (different vulnerability classes than what each was scoped to check).
- `git diff dev...dev-t-login-error-handling --stat` confirms scope discipline: only the 7 files the plan named were touched (helper, AuthContext, LoginPage, auth.service + spec, spec/plan docs) — no drive-by changes.

The two Low findings (F-01, F-02) are informational only — both have a documented, legitimate reason and neither reflects an actual gap in this feature's own correctness or test coverage. CI (#6) and the security subagent (#10) are the two items genuinely out of QA's scope at this point in the pipeline (pre-push, parallel dispatch respectively) and are called out as such rather than silently skipped.

No user override needed — no WARN was raised.

## Approved for ship: true, pending the parallel security subagent's own sign-off (QA cannot clear a security BLOCK; `/release-gate` orchestrator aggregates both before devops proceeds).
