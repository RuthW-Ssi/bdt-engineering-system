# QA + Security Sign-off — Drawing PDF Upload + Preview

- **feature:** F-Drawing PDF Upload + Preview
- **branch:** `dev-t-drawing-pdf-upload`
- **date:** 2026-09-14
- **decision:** **PASS** (after fixes) — security initially **BLOCK** (1 High finding), qa **WARN** (3 Medium findings); all resolved same session, re-verified independently
- **approved_for_ship:** true
- **user_overrode:** false — no override needed, all blocking/warning findings were fixed rather than accepted as-is
- **shipped:** commit `f257848` on `dev-t-drawing-pdf-upload`, pushed to origin 2026-09-14. `dev`/`staging`/`main` promotion pending as a separate step.

## checks_performed

| # | check | performed | result |
|---|---|---|---|
| 1 | Notion task DoD | n/a | no pre-existing task — created same session as part of this run (backfilled at completion, matching this project's established pattern for same-day work) |
| 2 | Wiki test summary exists | yes | pass — `wiki/tech/testing/per-feature/drawing.md`, 2026-09-14 increment section, complete DoD-style table + bug/security writeups |
| 3 | Wiki summary internal consistency | yes | fail → fixed (QA-02: global "Coverage achieved"/"Known gaps" sections from an older increment contradicted this one's Vitest coverage — annotated as historical + superseded) |
| 4 | Feature wiki page reflects this increment | yes | fail → fixed (QA-01: status banner + dated subsection added) |
| 5 | Backend/frontend test suites | yes (re-run independently by qa agent, and again after each fix round) | pass — backend 684/684 (17 pre-existing failures unchanged), frontend 55/55 |
| 6 | `tsc --noEmit` both sides | yes | pass, clean |
| 7 | CI on branch | n/a | branch just pushed, no run exists yet |
| 8 | Manual/live test evidence | yes | pass — user live-verified the original feature in the running dev app; this session additionally live-verified (Playwright, real Chrome) that the PDF preview renders correctly both before and after each security-fix iteration, including catching that the first fix attempt (`sandbox=""`) broke real rendering before it could ship |
| 9 | Smoke test coverage claim accuracy | yes | fail → fixed (QA-03: PDF error-state branch was implemented but untested; test added) |
| 10 | No active security BLOCK | yes (2 full re-verification passes) | pass — F-001 RESOLVED, no bypass found in either the backend allowlist or the frontend force-retype mitigation |

## findings

- Security: `docs/security/findings/2026-09-14-drawing-pdf-upload.md` — 1 finding (F-001, High → RESOLVED). Full chain documented: initial BLOCK, an approved-then-reverted intermediate fix (`sandbox=""`, reverted after live testing showed it breaks Chromium's native PDF viewer entirely — a genuine engine limitation, not a mistake in applying it), and the final fix (backend contentType allowlist + frontend blob-type force-retype), independently re-verified twice.
- Risk register: `docs/security/risk-register.md` — `R-012` (new), status updated to reflect the final mitigation.
- QA: 3 Medium findings (QA-01/02/03, all documentation/test-coverage-completeness gaps in the wiki artifacts, not production defects) — all fixed same session, no re-dispatch needed to confirm (mechanically verifiable: wiki content read back matches, new test passes).

## summary

This release-gate run caught a real, exploitable High-severity vulnerability before it shipped (this feature introduced the app's first in-page render of fetched file bytes, which turned a previously-Medium/observational gap — unvalidated upload `contentType` — into a genuine stored-XSS path). It also caught, via live browser verification rather than assumption, that the first proposed fix would have shipped a broken feature (Chromium refuses to run its native PDF viewer inside any sandboxed iframe). The final fix — a backend content-type allowlist plus an unconditional frontend blob-type force-retype — closes the vulnerability through two independent layers, neither of which depends on the other holding, and was verified live to preserve full PDF preview functionality.

The `qa`/`security` named subagent types were unavailable in this session (same recurring environment limitation as `2026-08-24-drawing-gcs-dxf.md` and other prior sign-offs) — both reviews, and both re-verification passes, ran as separate `general-purpose` agent dispatches loaded with the actual role-card instructions, rather than as the main agent doing the review itself. This is closer to the intended separation-of-concerns than the main-agent fallback used previously, and is noted here transparently.

**Recommendation:** ship. No outstanding blocking or warning items. Immediate next step: the `dev`→`staging`→`main` promotion chain (separate from this sign-off, tracked as a follow-up action in this same session).
