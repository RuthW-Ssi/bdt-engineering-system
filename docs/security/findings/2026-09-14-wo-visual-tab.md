# Security Review — F-WO Visual Tab Real Drawing Swap-in (T01)

- **Notion task:** T01 — Real drawing swap-in for WO Visual Tab
  (https://app.notion.com/p/3dbaa61b71f68183928dc56ae15962a2)
- **Notion feature:** F-WO Visual Tab Real Drawing Swap-in
  (https://app.notion.com/p/3dbaa61b71f68115af1edee4a399a8d4)
- **Branch:** `dev-t-wo-visual-real-drawing` (base `dev`) — changes
  UNCOMMITTED in the working tree at review time
- **Reviewer:** security subagent (review-only, OWASP API Top 10 2023
  baseline), via `/release-gate`
- **Date:** 2026-09-14
- **Verdict: PASS** — no findings

---

## Scope reviewed

```
git diff dev -- src/api/wo.ts src/components/wo/ src/pages/WoDetail.tsx
```

- `src/api/wo.ts` — `WoDetail` type: added `id: number` to the `zone` /
  `sub_zone` nested types on `bom_assembly.dispatch` and `snapshot_dispatch`
- `src/components/wo/WoDrawingPlaceholder.tsx` — deleted (dead "coming soon"
  stub, replaced by the real drawing panel)
- `src/components/wo/WoVisualTab.tsx` — now fetches zone drawings
  (`useZoneDrawings`), matches the latest `.dwg` for the WO's assembly mark
  (`findLatestDwgForMark`), and renders `DrawingPreviewPanel` (or an empty
  state) instead of the placeholder
- `src/pages/WoDetail.tsx` — passes `zoneId`/`subZoneId` (derived from
  `wo.snapshot_dispatch ?? wo.bom_assembly.dispatch`) into `WoVisualTab`
- `src/components/wo/WoVisualTab.test.tsx` — new, unit tests for
  `findLatestDwgForMark` only (pure function, no I/O)

Frontend-only PR, confirmed by `git diff dev --stat`: exactly the 4 files
above changed, nothing under `backend/`, `.github/workflows/`, `Dockerfile*`,
or `backend/prisma/`.

## Checks performed

1. **`WoDetail.zone.id` / `sub_zone.id` type-widening — not a new data
   exposure.** Checked `backend/src/modules/work-orders/work-orders.service.ts`
   `WO_DETAIL_INCLUDE` (line ~44-53):
   ```
   bom_assembly: {
     include: { dispatch: { include: { project: true, zone: true, sub_zone: true } } },
   },
   ```
   `zone: true` / `sub_zone: true` are full Prisma relation includes (not a
   `select`), so the complete `zone`/`sub_zone` rows — `id` included — were
   already being serialized into the `GET /work-orders/:id` JSON response
   before this change. Same pattern confirmed for `snapshot_dispatch` at
   line ~175 (`include: { project: true, zone: true, sub_zone: true }`).
   This diff only makes the frontend `WoDetail` TS interface honest about a
   field the backend already sent — no new backend field exposure, no
   change to any `include`/`select` on the backend (backend files are
   untouched in this PR's diff). **Not a finding.**

2. **`findLatestDwgForMark` — no injection/traversal.** Pure client-side
   string function: strips the file extension via regex, splits on `' - '`,
   lowercases and compares against `mark`. Inputs are both backend-sourced
   (`Drawing.file_name` from `useZoneDrawings` → `GET /drawings`; `mark`
   from `wo.bom_assembly.assembly_mark`), not raw user input from this
   component. The function's only output is selecting *which* already-
   fetched `Drawing` object to hand to `DrawingPreviewPanel` — it does not
   construct a URL, file path, or query string itself. Confirmed no
   `dangerouslySetInnerHTML` anywhere in `WoVisualTab.tsx`; the one new
   string interpolation (`` `No drawing uploaded for mark "${mark}" yet.` ``
   in the empty-state message) is rendered as plain JSX text via `EmptyBox`,
   which React escapes. **Not a finding.**

3. **No new data-fetching path with different auth characteristics.**
   `WoVisualTab` calls `useZoneDrawings(zoneId, subZoneId)` (existing hook,
   unchanged) → `getDrawingsByZone()` in `src/api/drawings.ts`, which uses
   the shared `apiClient` (same authenticated Axios instance as every other
   call in the app — confirmed via `import { apiClient } from './client'` at
   the top of `drawings.ts`). `DrawingPreviewPanel` is imported and rendered
   unchanged from `src/components/drawings/DrawingPreviewPanel.tsx`. No new
   `fetch()`, no new endpoint, no bespoke auth header handling introduced.
   **Not a finding.**

4. **Pre-existing risk-register items — confirmed not touched/worsened.**
   - **R-001 / R-011 (API1:2023 BOLA, permission-ungated reads)** — this PR
     adds no new backend endpoint and does not add or remove any
     authorization check; it's additive UI wiring on top of an
     already-ungated `GET /drawings` and `GET /work-orders/:id`. Gap is
     inherited unchanged, not introduced or widened by this feature.
   - **R-012 (A03:2021 stored-XSS-via-blob-Content-Type in
     `DrawingPreviewPanel`)** — verified `dev`'s current
     `src/components/drawings/DrawingPreviewPanel.tsx` (merged via PR #170,
     commit `f257848`, present on `dev` at `bb61a5c` which this branch is
     based on) already contains the force-retype mitigation in
     `useDrawingPdfUrl()` (`new Blob([blob], { type: 'application/pdf' })`
     before `URL.createObjectURL()`) and the corrected (no-`sandbox`)
     iframe. `WoVisualTab.tsx` imports and renders this component
     unmodified — it inherits the already-Mitigated state, does not
     reintroduce `sandbox=""`, and does not add a second preview surface
     with different handling. **Confirmed, not reopened.**
   - No new file-upload, no new content-type handling, no new log
     statements touching untrusted input (R-007/R-009/R-010 categories) —
     none of those anti-patterns appear in this diff.

## OWASP checklist (per role card Definition-of-Done)

- [x] N/A — no `POST`/`PATCH`/`DELETE` endpoints in scope (frontend-only PR,
  zero backend files changed)
- [x] N/A — no new DTO/input surface added
- [x] N/A — no `$queryRaw` usage in scope
- [x] Grep clean: `password|secret|key|credential|DATABASE_URL` — none of
  those patterns appear in the diff
- [x] N/A — no file upload endpoint in scope
- [x] Risk register cross-checked (R-001, R-011, R-012) — confirmed
  unaffected
- [x] Findings file written (this file)

## Verdict

**PASS.** No findings. Purely additive frontend wiring that reuses
already-reviewed data paths (`useZoneDrawings`, `DrawingPreviewPanel`) and
widens a TS type to match data the backend was already sending. Does not
touch, worsen, or reopen any tracked risk-register item.
