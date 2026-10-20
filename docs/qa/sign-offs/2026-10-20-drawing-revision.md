# QA Sign-off — Drawing per-mark revision + A3 normalise

- **feature:** Drawing per-mark revision, upload version kept as the batch number, A3 landscape normalise, staging upload key (Sprint 39)
- **branch:** `dev-t-drawing-revision` (base `origin/dev` `58ad7e3`), ~22 commits, **not pushed**
- **date:** 2026-10-20
- **reviewer:** qa (this run, general-purpose agent loaded with the `qa` role card — named `qa` subagent type unavailable in this session, same recurring environment limitation noted in prior sign-offs, e.g. `2026-09-14-drawing-pdf-upload.md`)
- **decision:** **WARN** — 4 Medium findings, 3 Low/Info, 0 Critical/High
- **approved_for_ship:** true — WARN accepted by Tao 2026-10-20 ("ปล่อยเลย"). Security F-1 fixed in 920a748; QA-04 Supabase pre-PR re-check done (300 rows, 0 unparsed, 0 NULL version); QA-01/02/03 and pre-existing Security F-2 carried as follow-ups.
- **user_overrode:** false (not yet asked)

## checks_performed

| # | check | performed | result |
|---|---|---|---|
| 1 | Notion task DoD | n/a | no Notion task exists yet (will be created post-gate per task framing) — judged against `wiki/features/drawing-revision-plan.md` (spec) + `wiki/features/drawing-revision-impl-plan.md` (plan) instead. All 4 "Open questions" in the spec are marked decided and implemented (version kept, sheets not duplicates, lower-rev allowed, A3 always). Task 8's live-check DoD sub-items are only partially done — see QA-01. |
| 2 | Wiki test summary exists | yes | pass — `wiki/tech/testing/per-feature/drawing-revision.md`, dated 2026-10-20 (today), by "controller (subagent-driven run)" |
| 3 | Wiki summary DoD coverage map ≈ 100% PASS | yes | 12 of 13 rows ✅ pass; 1 row explicitly "⚠ gap" (3 live-check items not run in a browser) — see QA-01. Not a blanket-pass table, but the gap is disclosed, not hidden. |
| 4 | Raw test report exists, current date | yes | **fail** — no `docs/test-scripts/drawing-revision/` folder exists — see QA-02 |
| 5 | Backend coverage on changed files | yes | **fail (inconclusive)** — `backend/coverage/coverage-summary.json` is stale (2026-09-15), predates this branch — see QA-03 |
| 6 | CI on branch is green | yes | n/a — branch not pushed yet, no CI run exists; expected pre-gate state in this project's workflow (push happens after qa/security clear) — see QA-05 |
| 7 | Wiki diff present for changed area | yes | pass — `wiki/features/drawing.md`, `wiki/index.md`, `wiki/tech/backend/api.md`, `wiki/tech/data-model.md` all modified; 3 new wiki pages (spec, impl plan, test summary) |
| 8 | Manual test evidence (user-provided) | yes | pass, with a caveat — Tao tested locally and approved ("ok เรียบร้อยดี", today); it's a brief overall approval rather than an itemized scenario list, backstopped by the controller's detailed Playwright live-check log — see QA-06 |
| 9 | Smoke test (if Playwright/E2E exists) | yes | n/a — no Playwright/E2E suite configured in this repo |
| 10 | No active BLOCK from security subagent | yes | no `docs/security/findings/2026-10-20-drawing-revision.md` found at review time — security's parallel pass is outside this review's scope; this review independently spot-checked the security-relevant code (staging-upload key, traversal guards, customer data gating — see findings file "Independent verification") and found it consistent with the ledger's fix history, but that is not a substitute for security's own sign-off |

## findings

- QA: `docs/qa/findings/2026-10-20-drawing-revision.md` — 4 Medium (QA-01..QA-04), 3 Low/Info (QA-05..QA-07).
  - QA-01 (Medium): WO Visual tab / MO print stamp / customer-login views not live-verified in a browser — unit-tested + code-reviewed only. fix_route: tester.
  - QA-02 (Medium): no dated raw test-script report for this feature (qualifies per CLAUDE.md §6). fix_route: tester.
  - QA-03 (Medium): backend coverage artifact stale, not regenerated for this branch's changed files. fix_route: tester.
  - QA-04 (Medium): plan's explicit pre-PR Supabase read-only re-check not evidenced as repeated since Task 2. fix_route: data.
  - QA-05/06/07 (Low/Info): no CI yet (expected), terse-but-present manual evidence, disclosed pre-existing/deferred items. No action required to ship; tracked for follow-up.
- Security: no separate finding file found for this feature at review time (see checklist #10).

## summary

This is a well-executed, heavily-reviewed branch: the SDD ledger shows two internal security findings (client-controlled `file_key` IDOR; path-traversal via `mark`/`file_name`) caught and fixed *during* the build itself, before this gate ever ran, plus a full whole-branch review and one fix round. The additive migration (`20261020100000_drawing_mark_rev`) is correctly non-destructive for the shared Supabase (nullable columns + backfill, no drops), and this review's own read of the DTO/service code confirms the staging-upload-key redesign, traversal guards, and customer data-gating all match what the ledger claims. No Critical/High findings.

The 4 Medium findings are all evidence/process gaps, not known implementation defects: an unfinished slice of Task 8's live-check list (customer view is the one worth prioritizing — it's the privacy-sensitive surface), a missing dated test-report artifact, a stale coverage file that can't currently prove the 90%/80% targets, and the plan's own "re-run the Supabase check right before the PR" step not shown as repeated in the ledger. None of these block on correctness grounds; all are closeable quickly (the Supabase re-check in particular is a 2-minute read-only query, already done once this session, and should simply be run again immediately before the PR opens, per the plan's own instruction).

**Recommendation:** WARN — ask Tao to explicitly accept these 4 Medium gaps (or have tester/data close QA-01..QA-04 first, which is fast given the groundwork already in place) before `devops` pushes and opens the PR into `dev`. Once accepted or closed, this is ready to ship.
