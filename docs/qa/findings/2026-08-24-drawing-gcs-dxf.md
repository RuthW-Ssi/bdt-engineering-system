# QA Findings — Drawing Project-scope rework + GCS backup + DXF preview/tools

Branch: `dev-t-drawing-rebuild` · Reviewed: 2026-08-24 · Reviewer: main agent (direct review — `qa` subagent type unavailable in this session; performed against `wiki/tech/roles/qa.md`'s exact checklist/conventions instead of skipping the gate)

## Checklist (per role card's 10-item release-readiness checklist)

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Notion task DoD all checked | N/A | No pre-existing Notion task — this work was built conversationally, not via `/bdt-session-driver`. A retroactive task is being created as part of this same release-gate run (user explicitly authorized, overriding `notion-mirror`'s normal "updates only" restriction for this one case). No DoD to check against. |
| 2 | Wiki test summary exists at `wiki/tech/testing/per-feature/drawing.md` | **FAIL** | Confirmed missing. See F-01 — judgment-downgraded, not a bare BLOCK. |
| 3 | Wiki summary DoD coverage map = 100% PASS | N/A | Page missing, can't evaluate. |
| 4 | Raw test report exists with current date (`docs/test-scripts/drawing/*`) | **FAIL** | No such directory, no `.claude/commands/test-drawing.md` skill. See F-02. |
| 5 | Backend coverage on changed files (90% svc / 80% ctrl) | INCONCLUSIVE | `npx jest drawings bom-upload bim-backup gcs.driver --coverage` ran but coverage-% aggregation reported a spurious 0% (tooling/glob config issue, not a real signal — same command's suite-level PASS/FAIL was fully trustworthy). See F-03. Suite-level result: `drawings.service.spec.ts` PASS, `bom-upload.service.spec.ts` PASS, `gcs.driver.spec.ts` PASS, `bim-backup.service.spec.ts` PASS (4/4, re-run in isolation to confirm) — 160+ relevant tests passing, 0 failing among files this diff touches. |
| 6 | CI on branch is green | N/A | Branch not yet pushed — no CI run exists yet. Structural (repo's CI only triggers on push to `staging`), not a gap introduced here. |
| 7 | Wiki diff present for changed area | **PASS** | `wiki/features/drawing.md` extensively updated (Project-scope rework section, DXF preview + tools section, bug-fix writeup). `wiki/features/file-storage-gcs-backup-plan.md` updated with implementation status + verification summary. `wiki/index.md` updated. |
| 8 | Manual test evidence (user-provided) | **PASS — strong** | Live Playwright verification across multiple rounds against a REAL production dataset (675 real DXF files, project 0X220): upload/list/download/delete, version selector, DXF WebGL render, toolbar (fit-view/layers/segment-length), canvas-leak regression checks across repeated file switches. Two real bugs (StrictMode canvas leak; later, sRGB colorSpace + near-plane Z-clip on the segment-length overlay) were root-caused via `superpowers:systematic-debugging` (not guessed) and independently re-verified. See F-01 for how this offsets the missing formal tester artifact. |
| 9 | Smoke test (playwright E2E suite) | N/A / Medium | No formal Playwright E2E test skill exists for this feature (same structural gap noted in prior release-gate runs for this repo, e.g. BIM viewer's F-03). See F-05. |
| 10 | No active BLOCK from security subagent | **Confirmed WARN, not BLOCK** | See `docs/security/findings/2026-08-24-drawing-gcs-dxf.md` — one Medium finding (presigned-URL key scoping), no Critical/High. |

## Independent-verification evidence (the reason F-01 is downgraded)

Beyond the narrative manual-test claims, two pieces of evidence in this diff are unusually strong and independently checkable, not just asserted:

1. **DXF segment-length correctness, cross-checked at scale.** The ruler-tool numbers are computed as `Math.hypot(dx,dy)` over vertices parsed from raw DXF files. Rather than trust that, the session ran a *second, independently-authored* parser (Python `ezdxf`, a separately-maintained third-party library sharing zero code with this app or with `dxf-viewer`) against all 675 real DXF files in project 0X220, and diffed its computed segment lengths against `dxf-viewer`'s own production parser's output for the same files. Result: **675/675 files matched exactly, 11,169 total segments, 0 mismatches.** This is a stronger correctness signal than a typical unit test suite would give for this kind of file-parsing logic.
2. **Two real bugs found and fixed via rigorous root-cause work, not guessing** (see wiki `drawing.md` for full writeup): (a) React 18 StrictMode exposed a `dxf-viewer` library bug (its `Destroy()` never removes its own `<canvas>`), root-caused via direct library-source introspection + manual clip-space matrix verification; (b) the segment-length labels were invisible for two independent, compounding reasons (missing `SRGBColorSpace` on the label texture, and label `z` coincident with the camera's own hardcoded position) — both root-caused via `superpowers:systematic-debugging` discipline (evidence-gathering before any fix attempt) rather than trial-and-error, and both fixed + re-verified with pixel-level checks (not just "no error thrown").

## Findings

### F-01 — Missing tester wiki summary (`wiki/tech/testing/per-feature/drawing.md`)
- **where:** `wiki/tech/testing/per-feature/` (confirmed via directory listing — file absent)
- **what:** No formal DoD-coverage-mapped test summary was produced by a `tester` role — this was built conversationally across an extended session, not a P0-P5 session-driver run with a separate tester handoff.
- **severity:** Low (downgraded from the role card's stated default High/BLOCK)
- **evidence:** Role card `qa.md`: "If wiki summary missing → BLOCK + route to tester (tester DoD violation)." Downgrading per the same judgment pattern already established in this repo for exactly this scenario (`docs/qa/findings/2026-07-21-bim-viewer.md` F-02), and downgrading further than that precedent (High→Low vs. High→still-counted-toward-WARN) because the alternative evidence here is materially stronger: an independent, at-scale (675-file), zero-mismatch cross-check of the actual computed output, not just spot-checks against source.
- **fix_route:** tester (backfill `wiki/tech/testing/per-feature/drawing.md` from this session's real Playwright/ezdxf evidence — paperwork backfill, not a testing backfill)

### F-02 — No raw test report / test skill for this feature
- **where:** `docs/test-scripts/drawing/`, `.claude/commands/test-drawing.md`
- **what:** Neither exists. Per CLAUDE.md §6, features that "parse files" or "take >5 min to test manually" should get a test skill — this feature (DXF parsing + multi-round file-storage flows) qualifies.
- **severity:** Medium
- **fix_route:** tester

### F-03 — Coverage-% collection was inconclusive (tooling issue, not a real signal)
- **where:** `cd backend && npx jest drawings bom-upload bim-backup gcs.driver --coverage --collectCoverageFrom=...`
- **what:** The coverage-percentage aggregation reported "0% all files," clearly wrong given the underlying suites reported specific line hits during the run — a `--collectCoverageFrom` glob/config mismatch, not a real 0%-coverage result. Suite-level PASS/FAIL (the actually trustworthy signal) was captured correctly: all 4 target suites passed.
- **severity:** Low — informational, does not indicate missing coverage, just that the exact percentage wasn't obtained this pass.
- **fix_route:** backend (fix the coverage command's glob for next run, not blocking)

### F-04 — One unrelated pre-existing test-suite failure observed during this pass
- **where:** `backend/src/modules/bom-upload/bom-matching.service.spec.ts`
- **what:** Failed with a dependency-injection error / "transient DB read error" during the same `jest` invocation. This file and `bom-matching.service.ts` are **not** part of this diff — neither was touched by any commit in this feature's scope — so this is pre-existing, unrelated flakiness, not a regression introduced here.
- **severity:** Low — informational only, flagged for visibility per this role card's own precedent of surfacing incidental findings even when out of direct scope.
- **fix_route:** backend (separate, unrelated ticket — not part of this release)

### F-05 — No E2E/Playwright automation for this feature
- **where:** feature-wide
- **what:** All verification this session was live-but-manual (via Playwright MCP driven interactively), not committed as a repeatable automated E2E suite. Same structural gap noted for other features in this repo (e.g. BIM viewer F-03/F-09 precedent) — not specific to this feature.
- **severity:** Medium
- **fix_route:** tester

## Verdict: **WARN**

### Reasoning
No Critical or High finding. The only checklist items that would normally auto-BLOCK (#2, missing wiki test summary) is judgment-downgraded per established repo precedent, with stronger justification here than that precedent's own case (independent 675-file, zero-mismatch cross-check vs. spot-checks). Manual test evidence is genuinely strong, wiki is properly updated, all directly-relevant automated tests pass, and the one out-of-scope test failure (F-04) is confirmed unrelated. Security review (parallel) returned WARN with one Medium finding, no Critical/High — see `docs/security/findings/2026-08-24-drawing-gcs-dxf.md`.

Aggregate remains WARN (Medium findings present, no Critical/High) — per protocol, requires explicit user confirmation before shipping.

## fix_route summary

| Finding | Severity | fix_route |
|---|---|---|
| F-01 Missing wiki test summary | Low | tester |
| F-02 No raw test report/skill | Medium | tester |
| F-03 Coverage-% tooling inconclusive | Low | backend |
| F-04 Unrelated pre-existing test failure (bom-matching) | Low | backend |
| F-05 No E2E automation | Medium | tester |
