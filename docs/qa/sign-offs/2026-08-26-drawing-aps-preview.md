# QA Sign-off — Drawing DWG APS 2D Preview

- **feature:** Drawing DWG-only upload + fire-and-forget push into APS OSS for an in-browser 2D preview (on top of the shipped zone-scope rework)
- **branch:** `origin/dev` (5 commits ahead of `origin/staging`) — PR [#132](https://github.com/RuthW-Ssi/bdt-engineering-system/pull/132) (`dev` → `staging`, not yet merged)
- **date:** 2026-08-26
- **decision:** **WARN** (qa) · **WARN** (security, dispatched in parallel — see `docs/security/findings/2026-08-26-drawing-aps-preview.md`, verdict WARN, F-001 High-taxonomy BOLA re-confirmed as pre-existing app-wide pattern and explicitly not BLOCKed per precedent, F-002 Low/informational) · combined `/release-gate` decision = **WARN**
- **approved_for_ship:** true — user explicitly confirmed proceeding despite the two Medium wiki-drift findings and security's F-001 ("y" in chat, 2026-08-26)
- **user_overrode:** true — wiki updates (QA-01, QA-02) to follow as an immediate post-merge pass, not blocking this merge

## checks_performed

| # | check | performed | result |
|---|---|---|---|
| 1 | Notion task DoD all checked | substituted — no Notion task exists; matched against the 6-item checklist confirmed live in chat, verified against the actual `git diff origin/staging..origin/dev` | pass — every checklist item verified byte-for-byte against the diff (bucket rename, new bucket key, `ApsClientService` extraction + backward-compat defaults, `DrawingApsService`, `.dwg`-only restriction + dead-code removal, `DrawingApsPreview.tsx`). See QA-03 for the process-deviation note (Low). |
| 2 | Wiki test summary exists at `wiki/tech/testing/per-feature/drawing.md` | file exists but is for a **different** increment | **fail — QA-01 (Medium)** — dated 2026-08-25, explicitly scoped to the zone-scope rescope, zero mention of APS/DWG-only/DrawingApsService |
| 3 | Wiki summary DoD coverage map = 100% PASS | n/a (no summary for this increment to check — see #2) | n/a |
| 4 | Raw test report exists with current date | no dedicated `docs/test-scripts/drawing-aps-preview/` report | pass, explained — matches the established small-test-surface precedent from `2026-08-25-drawing-zone-scope.md` (QA-04 there); test counts independently re-run and confirmed accurate in this pass instead (see findings file) |
| 5 | Backend coverage on changed files (90% svc · 80% ctrl · 100% DTO) | qualitative, not run via `--coverage` this pass | pass, qualitative — `drawing-aps.service.spec.ts`'s 11 tests cover the happy path, 3 distinct failure modes (GCS fetch fail / APS upload fail / ensureBucket reject), all 3 terminal+non-terminal status states, and viewer-token retrieval; `drawings.service.spec.ts`'s 3 new tests cover trigger/skip/case-insensitivity — no obvious untested branch found while reading `drawing-aps.service.ts` line-by-line |
| 6 | CI on branch is green | `gh pr checks 132` → 2/3 pass, 1 fail (`Vercel – bdt-app`) | **investigated, not a red-CI BLOCK — QA-05 (Low/Info)** — identical failure reproduces on PR #130 (already-merged precedent), tied to an apparently orphaned second Vercel project; the actual deployed project (`bdt-engineering-system`) is Ready with a live preview URL |
| 7 | Wiki diff present for changed area | no | **fail — QA-02 (Medium)** — `wiki/features/drawing.md` still describes the removed PDF/PNG/JPG/DXF dispatch as current; no commit in `knowledge-base` touches it (or adds a new page) for this increment |
| 8 | Manual test evidence (user-provided) | none exists | **QA-04 (Low/Info)** — expected/acceptable per task brief: branch hasn't reached staging, real DWG→APS translation needs real credentials there; recommended as post-merge follow-up |
| 9 | Smoke test (playwright, if E2E exists) | none for this increment | same as #8 |
| 10 | No active BLOCK from security subagent | checked `docs/security/findings/2026-08-26-drawing-aps-preview.md` | clear — security's own verdict is **WARN**, not BLOCK; F-001 (BOLA, High taxonomy) explicitly reasoned as pre-existing app-wide pattern (same as `R-001`/`R-011`) and not release-gating, per security's own "Release-gating judgment" section |

## findings

- `docs/qa/findings/2026-08-26-drawing-aps-preview.md` — 5 findings: 0 Critical, 0 High, 2 Medium (QA-01, QA-02), 3 Low/Info (QA-03, QA-04, QA-05)

## summary

No Critical/High defects found by QA. Every checkable implementation claim was independently re-verified and matched exactly: the full backend suite re-run at 620/637 passing with the identical known-pre-existing 17 failures across exactly `template-binding`/`cycle-time`/`project-progress`/`bom-matching`, the targeted `drawing-aps`/`drawings.service`/`bim` run at 48/48 (11 new `DrawingApsService` + 3 new `DrawingsService` + 22 unchanged BIM-adjacent tests — commit `768ca37`'s and `4cf6fcd`'s claimed counts confirmed exactly), all four build checks clean (`tsc --noEmit` backend + frontend, `nest build`, and the real `pnpm build`/`tsc -b`), `ApsClientService`'s bucket-scoped methods and `translate()` all default to BIM's pre-existing behavior with zero call-site changes to `bim.service.ts`/`bim-backup.service.ts`/`property-extractor.ts` beyond the import path, and a full-repo grep for `dxf-viewer`/`DxfPreview`/`APS_BUCKET_KEY`(old)/`fetchDrawingBlob` returned zero hits outside historical (pre-dating) docs.

The two substantive gaps are both wiki drift, not correctness gaps: **QA-01** (no wiki test summary exists for this increment — the only `wiki/tech/testing/per-feature/drawing.md` page on file is for the prior zone-scope increment) and **QA-02** (`wiki/features/drawing.md` still describes the removed multi-format preview dispatch as current, with no mention of the APS architecture, the two new endpoints, or the three new `drawing` columns). This project's own convention (feedback_wiki_update.md) requires a wiki update after every feature before closing — that hasn't happened yet for this increment. Neither finding implies the shipped code doesn't work; both are documentation-currency gaps that will compound into future wiki contradictions if left unaddressed.

Security's parallel review (`docs/security/findings/2026-08-26-drawing-aps-preview.md`) independently reached the same WARN altitude: F-001 (BOLA on the two new `:id`-keyed routes) is High by taxonomy but explicitly reasoned as a re-confirmation of an already-tracked, already-WARNed, app-wide pattern (`R-001`/`R-011`) rather than a new regression, and security's own judgment is not to BLOCK on it.

Three Low/Info findings round out the picture: **QA-03** (no Notion task filed, same pattern as the immediately-preceding zone-scope increment), **QA-04** (no manual/live test evidence against real APS credentials — expected, this branch hasn't reached staging yet), and **QA-05** (PR #132's `Vercel – bdt-app` check fails, but reproduces identically on the already-merged PR #130 and traces to an apparently orphaned second Vercel project, not this diff).

**Recommendation:** get explicit user confirmation to proceed despite QA-01/QA-02 (wiki update can follow as an immediate post-merge step, matching this project's `wiki-integrator` cascade at release-gate step 6.1), and file the retroactive Notion task (QA-03). Once staging is live, do a real click-through (upload `.dwg` → watch translation → confirm 2D viewer renders) to close QA-04. QA-05 is a devops housekeeping item (stale Vercel project), not blocking. If the user confirms, re-issue this sign-off with `approved_for_ship: true` and `user_overrode: true`, following the pattern established in `docs/qa/sign-offs/2026-08-25-drawing-zone-scope.md`.
