# QA Findings — F-WO Visual Tab Real Drawing Swap-in (T01)

> **All findings resolved same session** — QA-01 fixed (comment rewritten),
> QA-02 fixed (raw report added: `docs/test-scripts/wo-visual-tab/wo-visual-tab-test-report-2026-09-14.md`),
> QA-03 accepted as-is. See `docs/qa/sign-offs/2026-09-14-wo-visual-tab.md`
> for the final PASS decision.

- **task:** https://app.notion.com/p/3dbaa61b71f68183928dc56ae15962a2
- **feature:** https://app.notion.com/p/3dbaa61b71f68115af1edee4a399a8d4
- **sprint:** 35
- **branch:** `dev-t-wo-visual-real-drawing` (uncommitted working tree at review time)
- **diff base:** `dev` (note: `dev` already contains the separate, already-shipped
  2026-09-14 F-Drawing PDF Upload feature — not part of this review)
- **reviewer:** qa (release-readiness, review-only)
- **date:** 2026-09-14

## Scope reviewed

`git diff dev -- src/api/wo.ts src/components/wo/ src/pages/WoDetail.tsx`:
- `src/api/wo.ts` — widened `bom_assembly.dispatch.{zone,sub_zone}` and
  `snapshot_dispatch.{zone,sub_zone}` types to include `id` (4 lines)
- `src/components/wo/WoDrawingPlaceholder.tsx` — deleted (132 lines, the Sprint-28
  "coming soon" mockup)
- `src/components/wo/WoVisualTab.tsx` — new `findLatestDwgForMark` pure matcher +
  `useZoneDrawings` wiring, renders `DrawingPreviewPanel` on match / `EmptyBox`
  otherwise, new `zoneId`/`subZoneId` props
- `src/pages/WoDetail.tsx` — passes `zoneId`/`subZoneId` sourced from
  `wo.snapshot_dispatch ?? wo.bom_assembly.dispatch` (same fallback expression the
  page already uses for its own display row)
- New untracked: `src/components/wo/WoVisualTab.test.tsx` (7 tests, pure-function only)
- `git diff dev -- backend/` — **empty**, confirms the "no backend change" claim

## Findings

### QA-01 — Dangling comment reference to a file deleted in this same diff
- **where:** `src/components/wo/WoVisualTab.tsx:69`
- **what:** The updated header comment reads *"...swapped the 'coming soon' stub
  for the real thing — see WoDrawingPlaceholder.tsx's own header comment, this is
  exactly that swap-in..."* — but `WoDrawingPlaceholder.tsx` is deleted by this
  same diff (confirmed via `git status`: `deleted: src/components/wo/WoDrawingPlaceholder.tsx`).
  A future reader following that pointer finds nothing, and `git log -- '*WoDrawingPlaceholder*'`
  is the only way to recover the referenced rationale.
- **severity:** Low
- **evidence:**
  ```
  +// WO is for, side by side with its shop drawing (2026-09-14: swapped the
  +// "coming soon" stub for the real thing — see WoDrawingPlaceholder.tsx's
  +// own header comment, this is exactly that swap-in). Reuses
  ```
  (from `git diff dev -- src/components/wo/WoVisualTab.tsx`)
- **fix_route:** fe (one-line comment edit — drop the dangling filename pointer
  or replace with "see git history for the deleted mockup's rationale")

### QA-02 — No raw test-report file for this increment (checklist item 4)
- **where:** `docs/test-scripts/` (no `wo-visual-tab` entry for 2026-09-14)
- **what:** Per QA checklist item 4, a raw test report with current date is
  expected at `docs/test-scripts/<feature>/*-test-report-*.md`. None exists for
  this increment. The wiki test summary explains this is a deliberate,
  precedented substitution ("verification was live against the running stack,
  and this wiki page + the test skill file are the durable re-run artifacts —
  same call as `user-module-permissions` and `project-progress-phase-tracking`"),
  not an oversight — but it is still a literal gap against the checklist as
  written.
- **severity:** Medium (per role card: "Medium (if wiki summary OK)" — wiki
  summary here is OK, so the conditional applies)
- **evidence:** `wiki/tech/testing/per-feature/wo-visual-tab.md`, "Test report
  (raw · for re-run)" section, lines 86-90.
- **fix_route:** tester (either generate a raw report file to close the gap, or
  formally adopt "wiki page + test skill = re-run artifact" as a documented
  project convention so this stops recurring as a per-release finding)

### QA-03 — No committed Playwright spec for this feature (self-disclosed known gap)
- **where:** repo-wide — no `playwright.config.*` found, no committed E2E spec
  for this feature
- **what:** Checklist item 9 ("Smoke test (if playwright exists)") does not
  apply at the project level — this repo has no committed/runnable Playwright
  suite (`test`: `vitest run` is the only test script in `package.json`; verified
  E2E coverage for this feature was via live Playwright MCP session only). The
  wiki test summary already discloses this as a known gap ("No automated
  Playwright spec file committed... same known gap pattern as
  `project-progress-phase-tracking`'s T10").
- **severity:** Low / INFO — not a fail against item 9 (condition not met,
  N/A), recorded here only because it's adjacent to QA-02 and worth tracking
  as a recurring pattern across features.
- **evidence:** `wiki/tech/testing/per-feature/wo-visual-tab.md`, "Known gaps /
  TBD (this increment)" section.
- **fix_route:** tester (no action required this release; consider a follow-up
  if this pattern keeps recurring across features)

## Checks performed (role-card checklist)

| # | check | result | note |
|---|---|---|---|
| 1 | Notion task DoD all checked | pass | Task/Feature pages use prose Completion Notes + Feature Description, not literal checkboxes (project convention) — every claim in them traced to matching diff evidence, see table below |
| 2 | Wiki test summary exists at `wiki/tech/testing/per-feature/wo-visual-tab.md` | pass | "2026-09-14 increment" section present, current-dated, not missing |
| 3 | Wiki summary DoD coverage map = 100% PASS | pass | all 7 rows in the 2026-09-14 increment table ✅ |
| 4 | Raw test report exists, current date | **fail** | see QA-02 (Medium) |
| 5 | Backend coverage on changed files | N/A | no backend files changed (`git diff dev -- backend/` empty) |
| 6 | CI on branch green | not applicable yet | no CI run exists — branch not pushed (pre-commit review), per task instructions noted rather than blocked |
| 7 | Wiki diff present for changed area | pass | `wiki/features/wo/README.md` (status banner), `wiki/features/drawing.md` (Constraints section, line ~639), `wiki/tech/testing/per-feature/wo-visual-tab.md` all updated 2026-09-14 |
| 8 | Manual test evidence | pass | Live Playwright MCP: WO 3/TC-CO1 match→preview swap, WO 7 no-match→empty state, cited in both Notion Feature completion notes and wiki DoD table |
| 9 | Smoke test (if playwright exists) | N/A | no committed Playwright suite in this repo at all (see QA-03) |
| 10 | No active BLOCK from security subagent | **not evaluated by qa** | security runs as a parallel subagent per `/release-gate`; out of this review's scope — orchestrator must confirm security's own decision separately |

### Notion completion-notes vs. actual diff cross-check

| Claim (Notion Task/Feature) | Verified against | Match |
|---|---|---|
| Files changed: `src/api/wo.ts`, `src/components/wo/WoVisualTab.tsx`, `src/pages/WoDetail.tsx`, deleted `WoDrawingPlaceholder.tsx`, new `WoVisualTab.test.tsx` | `git status` + `git diff dev --stat` | exact match |
| No backend changes | `git diff dev -- backend/` (empty) | confirmed |
| `zone.id`/`sub_zone.id` widened, data already in API response | `src/api/wo.ts` diff — type-only change, no Prisma/query change | confirmed |
| Tests: frontend 62/62 passing (+7 new) | `npx vitest run src/components/wo/WoVisualTab.test.tsx` → 7/7; `npx vitest run` (full) → 62/62 | confirmed exactly |
| `tsc --noEmit` and real `pnpm run build` (`tsc -b`) both clean | `pnpm run build` → `tsc -b && vite build` succeeded, no errors (only a pre-existing, unrelated >1000kB chunk-size warning) | confirmed |
| Deleted `WoDrawingPlaceholder.tsx`, zero remaining references | `grep -rn "WoDrawingPlaceholder" src/ backend/` → 1 hit, in a **comment**, not a code reference | partially confirmed — see QA-01 (the "zero remaining references" claim is true for code/imports but not for a stray comment mention) |
| Match found → renders `DrawingPreviewPanel` | `src/components/wo/DrawingPreviewPanel.tsx` exists, imported and used correctly in `WoVisualTab.tsx` | confirmed |
| No match → "No drawing uploaded for mark X yet" empty state | `WoVisualTab.tsx` `EmptyBox` call matches text exactly | confirmed |

## Overall assessment

Implementation matches its Notion completion notes and wiki test summary almost
exactly — one small inaccuracy in the "zero remaining references" framing
(QA-01, cosmetic) and one literal checklist gap that the team has a repeated,
documented precedent for accepting (QA-02, Medium per role card's conditional
rule). Test counts (7/7 new, 62/62 full suite) and the real `tsc -b` build were
independently re-run and match the claims exactly. No backend change, confirmed
by empty diff. Wiki updated in all 3 expected locations.
