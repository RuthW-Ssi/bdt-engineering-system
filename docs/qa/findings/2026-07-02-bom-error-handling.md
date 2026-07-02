# QA Findings — F-BOM Error Handling
_Date: 2026-07-02 · Branch: dev-t-bom-error-handling (local only, not yet pushed) · Feature: F-BOM Error Handling (T-S18.05–11) · Sprint 18_
_Reviewer: qa subagent · Dispatched by /release-gate · Review-only_

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 1 |

**Decision: WARN** — one Medium finding (partial manual test evidence), already resolved via prior documented user acceptance. One Low finding, informational only.

---

## Findings

### F-01 · MEDIUM — 5 of 8 planned scenarios verified via code review only, not live (dev DB has zero `product_bom` records)

- **where:** `src/hooks/useBom.ts` (`updateLineQty`, `deleteLineById`), `src/pages/BomEditor.tsx` (`handleActivate`), `src/hooks/useBomDiff.ts` (both `.catch()` chains), `src/pages/BomDiffReview.tsx` (error render branch) — verified in wiki summary `wiki/tech/testing/per-feature/bom-error-handling.md` DoD coverage map, rows 3–5 and 7.
- **what:** BomEditor's 3 mutations (quantity update, activate, delete) and BomDiffReview's dedicated error-state render — the highest-risk code in this feature, since they're the only paths that mutate data rather than just fetch it — were never exercised live. Verification is task-scoped code review only (exact diff-vs-spec comparison per task reviewer), not a running browser session. Root cause is a pre-existing environment gap (dev DB has 0 `product_bom` rows), not a defect introduced by this feature.
- **evidence:** Confirmed by direct code read (`git diff dev...dev-t-bom-error-handling -- src/hooks/useBom.ts src/pages/BomEditor.tsx src/hooks/useBomDiff.ts src/pages/BomDiffReview.tsx`): all 4 sites use the identical, already-proven pattern (`try/catch` → `toast.error(getErrorMessage(err, '<specific message>'))`) that IS live-verified elsewhere in this same feature (BomList's query-failure toast, same `getErrorMessage` helper, same `toast.error` call shape). Wiki summary "Known gaps" section discloses this explicitly and states: "User explicitly accepted code-review-level verification as sufficient for these... rather than investing time creating test data." Notion T-S18.11 completion notes confirm: "Remaining 5 scenarios... not live-tested — dev DB has zero product_bom records, a pre-existing environment gap. User accepted code-review-level verification as sufficient for those."
- **severity:** Medium — real gap in live evidence for data-mutating code paths, but heavily mitigated: (1) legitimate, feature-unrelated root cause, (2) rigorous per-task code review by an independent reviewer, (3) pattern-identical to code that IS live-verified in the same branch, (4) explicit, dated, on-the-record user acceptance already exists (Notion T-S18.11).
- **fix_route:** tester — optional follow-up, not blocking: seed 1–2 `product_bom` rows in dev DB (e.g. via the existing "Update BOM" UI flow) to close this gap in a future pass; not scoped to this feature.

---

### F-02 · LOW — Wiki features page not yet updated for BOM (expected — post-ship cascade not yet run)

- **where:** `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/features/error-handling.md`
- **what:** This page currently documents only "F-Login Error Handling (Sprint 18) — shipped." No BOM section exists yet. Per `bdt-app/CLAUDE.md` §5.2, this is by design — wiki feature-page updates are Step 6.1 of `/release-gate`'s post-ship docs cascade, run by `wiki-integrator` after devops commits/pushes, not before. The tester's wiki **test** summary (QA's mandatory artifact) is present, current, and thorough.
- **evidence:** `grep -n -i "bom\|login" wiki/features/error-handling.md` returns only Login-section matches; no "F-BOM Error Handling" heading present as of this review.
- **severity:** Low (informational, same pattern as F-Login's F-02 finding — not a gap at this stage in the pipeline)
- **fix_route:** wiki-integrator — picked up automatically at `/release-gate` Step 6.1 after commit/push; also should record the "mutation global net is now dormant by design" decision flagged in the wiki summary's Known gaps.

---

## Notes (non-findings, for context)

- **Architecture pivot (mutation opt-out → opt-in) verified clean, not a scope-change violation.** Checked `git show dc5e0da`, `git show 144ee2e`, `git show 1ecce6c` directly: the pivot is honestly narrated across 3 commits (8-site opt-out fix → discovered ~25 more sites via `mutateAsync` grep → opt-in pivot that cleanly reverts the now-meaningless 8 additions). Documented in Notion (T-S18.05 "Update" section + T-S18.11 completion notes), wiki summary ("Known gaps"), and independently re-reviewed against actual installed `@tanstack/query-core@5.100.5` source ("Ready to merge: Yes"). Confirmed via `grep -rn "showGlobalErrorToast" src/` that no call site currently opts in — consistent with the wiki summary's disclosure that "the global safety net for mutations delivers zero runtime behavior currently" by design.
- **Scope discipline confirmed.** `git diff dev...dev-t-bom-error-handling --stat` touches only the 8 files the plan named (+ spec/plan docs) — none of the explicitly out-of-scope files (`BomUpload.tsx`, `BomPaintConfig.tsx`, `BomRoutingConfig.tsx`, `BomWireConfig.tsx`, `boms` backend module, BomDiffReview's Approve/Reject buttons) were touched.
- **`npx tsc -p tsconfig.app.json` reproduced independently → 0 errors**, matching the wiki summary's claim.
- Commit messages use `[bom-error-handling] ...` rather than the `[S<N>-<task-id>]` convention in `CLAUDE.md` §6 — already caught and dispositioned at task level (T-S18.07 completion notes: "plan-writing inconsistency, accepted"). Not re-raised as a new finding.
