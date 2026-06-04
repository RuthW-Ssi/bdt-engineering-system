# QA Findings · Dashboard Showcase v1

**Date:** 2026-06-04
**Feature:** dashboard (showcase v1)
**Branch:** `dev-dashboard-showcase`
**QA subagent:** qa role card v1
**Decision:** WARN

---

## Checklist summary

| # | Check | Target | Result |
|---|---|---|---|
| 1 | Notion DoD all checked | 100% | PARTIAL — Notion not accessible; wiki feature DoD used as proxy; 1 criterion deferred |
| 2 | Wiki test summary exists | exists · current date | PASS — `wiki/tech/testing/per-feature/dashboard.md` · dated 2026-06-04 |
| 3 | Wiki summary DoD coverage map = 100% PASS | all ✅ | PASS (with 1 known deferred item) |
| 4 | Raw test report exists with current date | file in `docs/test-scripts/dashboard/` | WARN — directory missing · no filled report file |
| 5 | Backend coverage on changed files | N/A (FE-only) | N/A — no backend changes |
| 6 | CI on branch is green | ✅ | WARN — no CI runs found for this branch (`gh run list` returned empty) |
| 7 | Wiki diff present for changed area | non-empty | WARN — `wiki/features/dashboard.md` updated but NOT committed to knowledge-base git |
| 8 | Manual test evidence (user-provided) | exists | WARN — no filled test report found; no user-provided screenshots or scenario checklist |
| 9 | Smoke test (if playwright exists) | N/A | N/A — Playwright not in repo (known) |
| 10 | No active BLOCK from security subagent | clear | PENDING — security review parallel; no override from QA |

---

## Findings

### F-001

- **where:** `bdt-app` git working tree · `git status` output
- **what:** Dashboard implementation files are UNTRACKED — not committed to `dev-dashboard-showcase` branch. `src/pages/Dashboard.tsx`, `src/components/dashboard/` (10 files), `src/data/dashboardMock.ts`, `src/hooks/useDashboardData.ts`, and the `src/App.tsx` modification are all in working tree only (staged or unstaged, not committed).
- **severity:** High
- **evidence:** `git diff dev..dev-dashboard-showcase --name-only` returns only `.claude/commands/test-dashboard-showcase.md`. All feature source files show as `??` (untracked) or `M` (modified) in `git status --short`. A push of the branch as-is would NOT include the dashboard code.
- **fix_route:** fe (stage + commit all dashboard source files: `src/pages/Dashboard.tsx`, `src/components/dashboard/*.tsx`, `src/data/dashboardMock.ts`, `src/hooks/useDashboardData.ts`, `src/App.tsx`)

---

### F-002

- **where:** `docs/test-scripts/dashboard/` (missing)
- **what:** The test report directory for the dashboard does not exist and no filled test report has been produced. The manual test skill (`.claude/commands/test-dashboard-showcase.md` Step 4) instructs saving a completed pass/fail report to `docs/test-scripts/dashboard/dashboard-showcase-test-report-YYYY-MM-DD.md`, but this file does not exist.
- **severity:** Medium
- **evidence:** `ls /Users/michel-angelo/Desktop/test555/bdt-app/docs/test-scripts/dashboard/` → `DIR_MISSING`. No `*dashboard*test*report*` file found anywhere under `docs/`.
- **fix_route:** tester (run `/test-dashboard-showcase`, fill in the pass/fail template, save to `docs/test-scripts/dashboard/`)

---

### F-003

- **where:** `~/Documents/bdt/knowledge-base/` git repo
- **what:** `wiki/features/dashboard.md` has been rewritten (superseded stub replaced with full feature spec) but the change is NOT committed to the knowledge-base git repo. It sits as an unstaged modification (`M` in `git status`).
- **severity:** Medium
- **evidence:** `git -C knowledge-base status --short` shows ` M projects/bdt-engineering-system/wiki/features/dashboard.md`. Last committed wiki entry for this file is commit `621403d` (Sprint 5 scaffolding) — the current v1 content is untracked.
- **fix_route:** wiki-integrator (commit the updated `wiki/features/dashboard.md` to knowledge-base, verify `log.md` entry appended)

---

### F-004

- **where:** `gh run list --branch dev-dashboard-showcase`
- **what:** No CI runs found for the `dev-dashboard-showcase` branch. The branch has no GitHub Actions history, meaning either: (a) no push has occurred yet (consistent with F-001 — code is not committed), or (b) CI is not configured for this branch pattern.
- **severity:** Medium
- **evidence:** `gh run list --limit 1 --branch dev-dashboard-showcase` returned empty output. The branch exists locally but CI has not validated TypeScript compilation, lint, or build in a clean environment.
- **fix_route:** fe / devops (resolve F-001 first — commit + push; CI should trigger automatically if `.github/workflows/` is configured for this branch pattern)

---

### F-005

- **where:** QA checklist item 8 — manual test evidence
- **what:** No user-provided manual test evidence exists. The tester wiki summary (`wiki/tech/testing/per-feature/dashboard.md`) describes the test scenarios and expected values but shows no record of a completed walkthrough. The test skill report template has not been filled in and no screenshots or confirmation notes are present.
- **severity:** Medium
- **evidence:** No `docs/test-scripts/dashboard/` directory. No screenshot files. No user confirmation notes in accessible Notion. Wiki test summary states tester role ran through scenarios but does not provide a dated completion record.
- **fix_route:** tester / user (Tao to run `/test-dashboard-showcase` and fill the report, OR provide explicit confirmation in chat that manual test was completed)

---

### F-006 (INFO)

- **where:** `wiki/tech/testing/per-feature/dashboard.md` · Known gaps table
- **what:** Component-level automated tests (vitest + RTL) for `FilterBar.tsx` and `KPIStrip.tsx` are deferred. This is acknowledged and expected for showcase v1. No action needed before user demo — follow-up required before MVP merge.
- **severity:** Low
- **evidence:** DoD coverage map row: "Component tests FilterBar + KPIStrip → ⏳ deferred". Tester wiki summary Known gaps table entry #1. CLAUDE.md DoD item: "(if FE test infra ready · else defer)".
- **fix_route:** tester (set up vitest + RTL per `wiki/tech/roles/tester.md` §"Test Infrastructure Roadmap" before real MVP merge)

---

## Risk summary for this release

This is a **showcase v1 / user-feedback prototype** on an isolated branch, intended for demo only — not for merge to `main`. Given that context, the WARN findings are acceptable risk IF the user (Tao) explicitly confirms:

1. The dashboard code will be committed before the demo (F-001 is the hard blocker for any reproducible state).
2. Manual test was or will be completed before the demo session.
3. The wiki commit gap (F-003) and CI gap (F-004) are accepted for this showcase iteration.

BLOCK condition: F-001 (untracked code) means the branch cannot be demonstrated consistently or handed off — it would work on Tao's machine only as working tree state. If the intent is only a local demo with no push/handoff, this may be acceptable risk, but the branch's purpose (isolated showcase for feedback) is not fulfilled without a commit.

---

_QA sign-off: docs/qa/sign-offs/2026-06-04-dashboard.md_
_Written: 2026-06-04 · qa role subagent · review-only_
