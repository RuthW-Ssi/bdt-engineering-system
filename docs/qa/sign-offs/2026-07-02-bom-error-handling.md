# QA Sign-off — F-BOM Error Handling
_Date: 2026-07-02 · Branch: dev-t-bom-error-handling (local only, not yet pushed) · Sprint 18_

## decision: WARN

## approved_for_ship: true

## user_overrode: true

---

## Checks performed

| # | Check | Target | Result |
|---|---|---|---|
| 1 | Notion task DoD all checked | 100% | PASS — T-S18.05–11 all Status=Done with substantive Completion Notes; Feature "F-BOM Error Handling" Status=Done. Notes honestly disclose a mid-review bugfix (T-S18.08, stale-error-not-reset, caught by task reviewer) and a late-discovered architecture pivot (T-S18.05 Update, T-S18.11) — both independently re-reviewed. |
| 2 | Wiki test summary exists | exists · current date | PASS — `wiki/tech/testing/per-feature/bom-error-handling.md`, dated 2026-07-02, self-spec mode disclosed in header. |
| 3 | Wiki summary DoD coverage map = 100% PASS | all ✅ | PARTIAL — 7 DoD rows, 3 marked "✅ pass — live" (Playwright), 4 marked "⚠️ pass — code review only" (dev DB has 0 `product_bom` records, a pre-existing environment gap). No row shows an actual failure; the ⚠️ marker itself is honesty about verification depth, not a masked gap. See finding F-01. |
| 4 | Raw test report exists with current date | latest | N/A (documented exemption) — feature doesn't meet `bdt-app/CLAUDE.md` §6 test-skill criteria (no computed/diffed data, frontend-only UI change); wiki summary gives re-verify commands instead, independently reproduced (`npx tsc -p tsconfig.app.json` → 0 errors). |
| 5 | Backend coverage on changed files | 90% svc · 80% ctrl | N/A — feature is frontend-only; `git diff dev...dev-t-bom-error-handling --stat` shows zero `backend/` files touched. |
| 6 | CI on branch is green | ✅ | N/A — branch is local only, not yet pushed to origin (push happens at `/release-gate` Step 5, after this review, per explicit dispatch instructions). Not treated as a red flag. |
| 7 | Wiki diff present for changed area | non-empty | Low finding (F-02) — `wiki/features/error-handling.md` still documents Login only; BOM section not added yet. Expected: per `CLAUDE.md` §5.2, feature-page updates are Step 6.1 of the post-ship docs cascade (`wiki-integrator`, after commit/push), not a pre-push gate item. The tester's wiki **test** summary (item #2, QA's mandatory artifact) is present and current. |
| 8 | Manual test evidence (user-provided) | exists | Medium finding (F-01) — 3/8 scenarios verified live via Playwright (query-failure toast, opt-out no-duplicate-toast via network log, error-vs-empty distinction), matched 1:1 against DoD rows. Remaining 5/8 (BomEditor's 3 mutations, BomDiffReview's error render, general mutation-toast) rely on code review only, for a documented, feature-unrelated reason. User explicitly accepted this trade-off (Notion T-S18.11 completion notes, dated 2026-07-02) rather than spend time seeding test data. |
| 9 | Smoke test (if playwright exists) | all green | N/A — no persisted Playwright/E2E suite in this repo; Playwright MCP was used ad hoc for this session's live scenarios (documented in wiki summary's "Smoke test" section as not a re-runnable suite). |
| 10 | No active BLOCK from security subagent | clear | PENDING/DEFERRED — `security` subagent is dispatched in parallel per `/release-gate`; its result is not visible within this QA run. Per role card, QA cannot override or pre-empt security's finding — final aggregation happens at the `/release-gate` orchestrator level. |

---

## Findings

- [F-01 · MEDIUM] 5/8 planned scenarios (BomEditor's 3 mutations, BomDiffReview error render) verified via code review only, not live — dev DB has 0 `product_bom` records (pre-existing, feature-unrelated gap); user already accepted this in Notion → `docs/qa/findings/2026-07-02-bom-error-handling.md#f-01`
- [F-02 · LOW] `wiki/features/error-handling.md` not yet updated with BOM section — correctly deferred to post-ship cascade (Step 6.1) → `docs/qa/findings/2026-07-02-bom-error-handling.md#f-02`

---

## Decision rationale

**WARN, not a clean PASS, but shippable.** The one substantive gap (F-01) is a real reduction in live-verification depth for this feature's highest-risk code (the 3 data-mutating BomEditor operations + BomDiffReview's error render) — enough that I won't wave it through as a Low/informational note the way F-02 gets waved through. But it does not rise to BLOCK:

- **Root cause is not this feature's fault.** The dev DB has zero `product_bom` records — a pre-existing environment gap, confirmed via the wiki summary and Notion notes, not something introduced or worsened by this branch.
- **The unverified code is pattern-identical to code that IS live-verified.** I read the actual diffs (`src/hooks/useBom.ts`, `src/pages/BomEditor.tsx`, `src/hooks/useBomDiff.ts`, `src/pages/BomDiffReview.tsx`) — all 4 unverified sites use the exact same `try/catch` → `toast.error(getErrorMessage(err, '<message>'))` shape as BomList's query-failure toast, which **was** confirmed live via Playwright. This is not untested code of an unfamiliar shape; it's the same primitive applied 4 more times.
- **Verification depth for the unverified paths was still real, not skipped.** Task-level code review did an exact diff-vs-spec comparison per task, not a rubber stamp (e.g. T-S18.08's reviewer caught and fixed a stale-error-reset bug that the plan itself missed).
- **The user already made this call, on the record.** Notion T-S18.11 completion notes explicitly state the user accepted code-review-level verification for these 5 scenarios rather than spending time seeding test data. That's a documented, dated, scenario-specific override — exactly what the role card's anti-pattern #5 asks for ("get explicit OK... before returning PASS"), just captured in Notion rather than in this session's chat. I'm treating that as satisfying the confirmation requirement and am **not** re-blocking on a decision the user already made deliberately.

Separately, I checked the late-discovered architecture pivot (mutation error handling flipped opt-out → opt-in) as instructed: `git show dc5e0da`/`144ee2e`/`1ecce6c` show a clean, honestly-narrated 3-commit story (8-site fix → discovered ~25 more sites → opt-in pivot that cleanly reverts the 8 now-meaningless additions), disclosed in Notion, wiki, and independently re-reviewed against actual installed library source. This is **not** an undisclosed scope change — it's a well-handled, well-documented deviation. No finding raised for it.

F-02 (wiki feature-page lag) is Low/informational only, following the exact same accepted pattern as the Login feature's F-02 finding earlier today (deferred to Step 6.1 post-ship cascade, not a pre-push gate item).

**user_overrode: true** — reflects the prior, documented Notion acceptance of the F-01 gap. If `/release-gate`'s orchestrator wants a fresh in-chat confirmation before proceeding, that's a reasonable belt-and-suspenders step, but on the evidence available to me this WARN is already resolved.

## Approved for ship: true, pending the parallel security subagent's own sign-off (QA cannot clear a security BLOCK; `/release-gate` orchestrator aggregates both before devops proceeds).
