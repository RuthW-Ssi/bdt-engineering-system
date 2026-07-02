# QA Findings — F-Login Error Handling
_Date: 2026-07-02 · Branch: dev-t-login-error-handling (local only, not yet pushed) · Feature: F-Login Error Handling (T-S18.01–04) · Sprint 18_
_Reviewer: qa subagent · Dispatched by /release-gate · Review-only_

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |

**Decision: PASS** — no Critical/High/Medium findings. Both Low findings are informational, don't block ship.

---

## Findings

### F-01 · LOW — `auth.service.ts` whole-file coverage below 90% svc target (pre-existing method, not new code)

- **where:** `backend/src/modules/auth/auth.service.ts` (coverage measured via `cd backend && npx jest auth.service.spec.ts --coverage --collectCoverageFrom='modules/auth/auth.service.ts'`)
- **what:** Whole-file coverage is 84% stmts / 80% branch / 75% funcs / 86.36% lines — below the role card's 90%+ services target. The gap is entirely the pre-existing, unchanged `getProfile()` method (lines 50-55), which this feature did not touch and which had no test before this branch either. The feature's own new code — `login()`'s two new `logger.warn(...)` branches plus the `sanitizeForLog()` helper added for the log-injection fix — is fully exercised by the 4 passing specs in `auth.service.spec.ts` (unknown login, wrong password, log-injection/CR-LF, silent success).
- **evidence:** Coverage report `Uncovered Line #s: 50-55` corresponds exactly to `getProfile()` (backend/src/modules/auth/auth.service.ts:49-56); `login()` (lines 27-47) has no uncovered lines in the same report.
- **severity:** Low
- **fix_route:** tester (optional, out of scope for this feature) — a follow-up test for `getProfile()` would close this file-level gap but is pre-existing tech debt, not introduced by F-Login Error Handling.

---

### F-02 · LOW — Wiki decisions/features pages not yet updated for this feature (expected — post-ship cascade not yet run)

- **where:** `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/backend/decisions.md`, `wiki/tech/frontend/decisions.md`, and no new `wiki/features/error-handling.md` page yet
- **what:** The plan's "Post-implementation" step calls out that this feature likely touches `wiki/tech/backend/decisions.md` (Logger-on-auth-failures convention) and possibly seeds a new `wiki/features/error-handling.md` page. Neither has happened yet. Per `bdt-app/CLAUDE.md` §5.2, this is **by design** — wiki page updates (features/api/data-model/decisions) are Step 6.1 of `/release-gate`'s post-ship docs cascade, run by `wiki-integrator` *after* devops commits/pushes, not before. The tester's wiki **test** summary (the QA-mandatory artifact) is present and current — only the decisions/features documentation cascade is pending, and it is correctly pending at this point in the flow (branch not yet pushed).
- **evidence:** `grep -rl "getErrorMessage\|welcome toast" wiki/` returns only `wiki/tech/testing/per-feature/login-error-handling.md` (today's test summary) plus one unrelated pre-existing match in `wiki/tech/frontend/decisions.md` (a different, older "toast-only success for create modals" decision). `find wiki -newermt "2026-07-02T00:00:00" -type f` returns only the test summary file.
- **severity:** Low (informational reminder, not a gap at this stage)
- **fix_route:** wiki-integrator — pick this up automatically at `/release-gate` Step 6.1 after commit/push; no action needed from QA now.

---

## Notes (non-findings, for context)

- Two security fixes landed mid-branch (`26011d0` — stopped logging raw `AxiosError`/password via `.config.data`; `35694c8` — sanitized login field against log injection, CWE-117), both caught by an automated background scanner and resolved same-day with regression tests (`auth.service.spec.ts` log-injection test). These are disclosed transparently in Notion completion notes (T-S18.02, T-S18.04) and the wiki test summary. QA does not re-adjudicate security findings (role card: "Must NOT... Override security findings") — the parallel `security` subagent has final say; noting here only because the disclosure itself is a positive signal (nothing hidden), not because it's an open QA item.
