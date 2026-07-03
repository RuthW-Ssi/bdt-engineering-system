# Design — Move Project selector out of the global header (Zones + BOM)

**Date:** 2026-07-03
**Author:** bdtapp@ssi-steel.com + Claude
**Status:** Approved design, pending implementation plan
**Repo:** `bdt-app` · branch `dev-t-project-selector-relocate`

---

## 1. Context & Problem

Today, "which Project am I working in" is a single piece of app-wide state: `ProjectContext` (`src/context/ProjectContext.tsx`), exposed via `useActiveProject()`. The only UI that can *change* it is a dropdown in the center of `Topbar.tsx` (`src/components/layout/Topbar.tsx:69-138`), rendered globally on every page via `AppShell`.

Six places currently read `activeProject`:

| File | How it uses it |
|---|---|
| `Topbar.tsx` | Owns the dropdown UI; auto-selects the first project on load if none set |
| `ZoneList.tsx` (`/zones`) | Reads only — filters the zone list, shows a static breadcrumb, gates Add/Reorder buttons |
| `BomList.tsx` (`/bom`) | Reads only — filters dispatches, gates the Zone/Sub-zone selects and the empty state |
| `Dashboard.tsx` | Manages its own separate mock-data `activeProjectId` state, one-way syncs it *into* the context |
| `ProjectList.tsx` (`/projects`) | Reads + writes — highlights the active card; double-click sets active project **and navigates to `/zones`** expecting it to already be selected there |
| `RoutingApply.tsx`, `BomUpload.tsx` | Read only — filter zones/sub-zones for their own flows |

The user only actually *needs* the header-level picker for `/zones` and `/bom` — the other four pages are out of scope for this change (see Non-goals). Per user decision, those four keep using `ProjectContext` unchanged; only `ZoneList` and `BomList` are cut over, and the Topbar dropdown is removed entirely.

**Two correctness gaps found while tracing call sites (not present in the original ask, but block a clean cutover):**

1. `ProjectList.tsx:230` — `onDoubleClick={() => { setActiveProject(p); navigate('/zones') }}` — double-clicking a project card jumps to `/zones` expecting Context to carry the selection. Once `ZoneList` stops reading Context, this silently breaks (lands on `/zones` with no project chosen).
2. Five "back to BOM" buttons navigate bare `navigate('/bom')` with zero project info, relying entirely on Context having "remembered" what was active: `BomDispatchDetail.tsx` (×3), `BomPaintConfig.tsx`, `BomRoutingConfig.tsx`, `BomUpload.tsx`'s back button, and Dashboard's `DispatchesWidget.tsx`. None of these files import `useActiveProject` today. Once `BomList` reads `project_id` from its own URL instead of Context, landing back on `/bom` with no `project_id` in the URL needs a sane fallback, or the user gets bounced to whatever project happens to be first in the list instead of the one they were just looking at.

---

## 2. Goals / Non-goals

**Goals**
- `ZoneList` and `BomList` each resolve "current project" independently via a `project_id` URL search param — no `ProjectContext` dependency.
- Remove the center project dropdown from `Topbar` entirely.
- Preserve existing gating behavior (Add/Reorder buttons, "select a project" empty states) and the existing Project→Zone→Sub-zone cascade in `BomList`'s filter bar (Zone select disabled until a project is chosen, Sub-zone select disabled until a zone is chosen or auto-skipped when the zone has none) — this cascade already exists in `BomList`'s current code (`disabled={!hasProject || ...}`) and needs no new logic, only re-pointing `hasProject`/`activeProject` at the new source.
- A missing `project_id` in the URL (page refresh, or navigating in from one of the 5 back-buttons / Dashboard widget above) falls back to **the last project the user picked** (remembered in `sessionStorage`), not just "whatever's first."
- Fix `ProjectList.tsx`'s double-click handoff so it still lands on the correct project.

**Non-goals**
- `Dashboard.tsx`, `RoutingApply.tsx`, `BomUpload.tsx`, `ProjectList.tsx`'s own active-card highlighting — all keep reading `ProjectContext` unchanged. `ProjectProvider` stays wrapping the app in `App.tsx`.
- Not touching the 5 "back to BOM" button files or `DispatchesWidget.tsx` — the `sessionStorage` fallback (below) resolves their missing `project_id` without editing them.
- No rich custom dropdown component — plain `<select>`, per approved option A.
- No progressive show/hide of the Zone/Sub-zone controls — they stay always-rendered, gated by `disabled`, matching the existing pattern (confirmed already correct, no changes needed there).

---

## 3. Design

### 3.1 Resolving "current project" — priority order

Both pages resolve the active project id on every render, in this order:

1. `project_id` in the URL search params, if present **and** it matches an id in the fetched project list.
2. Else, `sessionStorage.getItem('bdt.lastProjectId')`, if present and it matches an id in the fetched project list.
3. Else, the first project in the fetched list (existing auto-select-first behavior, same as today's `Topbar`).
4. Else (no projects exist at all): no project resolved — existing "select a project" empty states render unchanged.

Whenever resolution lands on step 2 or 3 (URL didn't already have it), write the resolved id back into the URL via `setSearchParams(..., { replace: true })` — same pattern `BomList` already uses for its zone/sub-zone auto-select effects, so the address bar always reflects what's showing.

Whenever the user explicitly changes the project via the new `<select>`, update the URL param **and** `sessionStorage.setItem('bdt.lastProjectId', ...)`. Both pages share the same storage key — it's "the last project you picked, on either page," not two separate memories.

### 3.2 `useProjects` for the option list

Both pages call `useProjects({ limit: 20 })` (already used today by `Topbar`) to populate the `<select>`'s options, rendered as `{project_code} — {name}`.

### 3.3 Clearing dependent filters on project change

- `BomList` already clears `zone_id`/`sub_zone_id` in a `useEffect` keyed on `activeProject?.id` — re-key it to the resolved `project_id` instead. No behavior change.
- `ZoneList` already resets `expandedZone` and `reorderMode` keyed on `projectId` (currently sourced from Context) — re-key the same effects to the resolved `project_id`. No new logic.

### 3.4 UI placement

- **`BomList`**: add the Project `<select>` as the first control in the existing filter bar (`src/pages/BomList.tsx:680`), before the Zone select. Same 30px-height style as the Zone/Sub-zone selects beside it.
- **`ZoneList`**: add a new filter-bar row directly below the page header — same 44px height / gray background (`#F5F5F5`) style `BomList`'s filter bar already uses — containing just the Project `<select>`. Remove the current static breadcrumb text (`activeProject.project_code` / `.name` at `ZoneList.tsx:262-268`); the "Zones" title stays in the header itself.
- Both pages: while no project is resolved (only possible when zero projects exist at all), existing empty states render unchanged.

### 3.5 `Topbar.tsx`

Remove the entire "CENTER — project selector" block (lines 69-138): the button, the dropdown panel, `projectOpen` state, `dropdownRef`, the outside-click effect, the auto-select effect, and the now-unused `useActiveProject`/`useProjects` imports. `Topbar` becomes: left (logo) · flexible spacer · right (search/bell/user).

### 3.6 `ProjectContext.tsx` / `ProjectProvider`

Untouched. Still wraps the app in `App.tsx`; still backs `Dashboard`, `RoutingApply`, `BomUpload`, `ProjectList`. Tracked as follow-on (§6) once those four are migrated too — only then does `ProjectContext` become deletable.

### 3.7 `ProjectList.tsx` double-click fix

`ProjectList.tsx:230` changes from:
```ts
onDoubleClick={() => { setActiveProject(p); navigate('/zones') }}
```
to:
```ts
onDoubleClick={() => navigate(`/zones?project_id=${p.id}`)}
```
`setActiveProject(p)` is dropped from this call — it was only there to hand off to the old Context-reading `ZoneList`. The explicit URL param is required here (not the `sessionStorage` fallback from §3.1), because double-clicking a *specific* card must always jump to *that* project, even if it differs from whatever was last remembered.

### 3.8 The 5 "back to BOM" buttons + `DispatchesWidget`

No code changes. Trace-through: by the time a user reaches `BomDispatchDetail`/`BomPaintConfig`/`BomRoutingConfig` from `BomList`, `BomList` already resolved a `project_id` (via §3.1) and wrote it to `sessionStorage` before the user navigated away. A bare `navigate('/bom')` back-click lands with no `project_id` in the URL, falls to §3.1 step 2, and picks up the same project that was active before — no regression. `DispatchesWidget.tsx` (Dashboard) is the one caveat: Dashboard's project selection is separate mock-data state that never writes to `sessionStorage`, so its "view all" click could land `BomList` on a stale remembered project rather than whatever Dashboard was showing. Accepted — Dashboard is explicitly out of scope and already mock-data-only.

---

## 4. Behavior matrix

| Scenario | Result |
|---|---|
| Visit `/zones` or `/bom` fresh, no prior visit this session, projects exist | Auto-selects first project (§3.1 step 3), writes to URL |
| Visit `/zones` or `/bom` fresh, a project was picked earlier this session (either page) | Resolves to that remembered project (§3.1 step 2) |
| Visit with `?project_id=X` already in the URL (bookmark, explicit link) | Uses X directly, no fallback needed |
| No projects exist at all | Empty state, unchanged from today |
| User changes project via the new `<select>` | URL + `sessionStorage` both update; dependent Zone/Sub-zone filters clear (`BomList`) or `expandedZone`/`reorderMode` reset (`ZoneList`) |
| Double-click a project card in `ProjectList` | Jumps to `/zones?project_id=<that card's id>` — always that project, never the remembered one |
| Click a "back to BOM" button from a dispatch sub-page | Lands back on the same project via `sessionStorage` fallback |
| `Dashboard`'s "view all dispatches" widget click | May land on a different project than Dashboard was showing (accepted gap, Dashboard out of scope) |

---

## 5. Verification (manual — no frontend test runner in this repo)

1. Type-check: `npx tsc -p tsconfig.app.json`.
2. Fresh session, visit `/zones` directly → first project auto-selected, zones load, URL gets `?project_id=`.
3. Change project via the new select on `/zones` → zone list reloads, `expandedZone`/reorder state resets.
4. Navigate to `/bom` (via sidebar) → same project the user was just on in `/zones` (sessionStorage fallback), not the first-in-list one (unless they happen to match).
5. On `/bom`, change project via the new select → `zone_id`/`sub_zone_id` clear, dispatch list reloads; confirm Zone select is disabled with no project, Sub-zone select is disabled with no zone or auto-skips when the zone has none (existing cascade, just confirming it still works off the new source).
6. Open a dispatch detail from `/bom`, click "Back to BOM" → lands back on the same project (§3.8).
7. From `/projects`, double-click a *different* project's card → lands on `/zones` with that project selected, not the remembered one.
8. Confirm `Topbar` no longer renders any project UI on any page, and no console errors from the removed imports.
9. Regression pass: `Dashboard`, `ProjectList` (single-click highlight), `RoutingApply`, `BomUpload` all still work unchanged (still Context-driven).

---

## 6. Follow-on (not in this pass)

- Migrate `Dashboard.tsx`, `ProjectList.tsx`, `RoutingApply.tsx`, `BomUpload.tsx` off `ProjectContext` the same way.
- Once all six consumers are migrated, delete `ProjectContext.tsx` and its `ProjectProvider` wiring in `App.tsx`.
- `DispatchesWidget.tsx` → `BomList` handoff could be closed properly at that point too (Dashboard would write to the same `sessionStorage` key instead of `ProjectContext`).
