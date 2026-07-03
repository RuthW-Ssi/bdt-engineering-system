# Project Selector Relocate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "current Project" picker out of the global `Topbar` and into `ZoneList` (`/zones`) and `BomList` (`/bom`) directly, so each page resolves its own project via a `project_id` URL param instead of the shared `ProjectContext`.

**Architecture:** A new shared hook, `useProjectSelection`, resolves the active project on each render (URL param → remembered `sessionStorage` value → first project in the list) and exposes a `selectProject` setter that updates both the URL and `sessionStorage`. `ZoneList` and `BomList` each call this hook instead of `useActiveProject()` and render a plain `<select>` locally. `Topbar` loses its center dropdown entirely. `ProjectContext` itself is untouched — `Dashboard`, `RoutingApply`, `BomUpload`, `ProjectList` keep using it.

**Tech Stack:** React 19 + TypeScript + Vite, `react-router-dom` v7 (`useSearchParams`), `@tanstack/react-query` (existing `useProjects` hook), no frontend test runner in this repo.

## Global Constraints

- No frontend test runner exists in this repo — verification per task is `npx tsc -p tsconfig.app.json` (must exit clean) + a manual browser check against the running dev server (`npm run dev` → `http://localhost:5173`), per established project convention (see `docs/superpowers/plans/2026-07-02-*.md`).
- Branch: `dev-t-project-selector-relocate` (already created and checked out).
- Commit message prefix: `[project-selector-relocate]`.
- Design source of truth: `docs/superpowers/specs/2026-07-03-project-selector-relocate-design.md` — every task below implements a specific section of it.
- Do not modify `ProjectContext.tsx`, `Dashboard.tsx`, `RoutingApply.tsx`, or `BomUpload.tsx` in this plan (explicitly out of scope, spec §2 Non-goals).
- `sessionStorage` key is exactly `'bdt.lastProjectId'`, shared by both pages (spec §3.1).

---

### Task 1: Shared `useProjectSelection` hook

**Files:**
- Create: `src/hooks/useProjectSelection.ts`

**Interfaces:**
- Consumes: `useProjects` from `src/hooks/useProjects.ts` (existing, signature `useProjects(params?: { limit?: number, ... })` returning `{ data: { items: ProjectDTO[] } | undefined }`), `ProjectDTO` from `src/api/types.ts` (has `id: number`, `project_code: string`, `name: string`).
- Produces: `useProjectSelection(searchParams: URLSearchParams, setSearchParams: ReturnType<typeof useSearchParams>[1])` returning `{ projects: ProjectDTO[], activeProject: ProjectDTO | null, selectProject: (project: ProjectDTO) => void }`. Tasks 2 and 3 both call this with the exact same shape.

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useProjectSelection.ts
import { useEffect } from 'react'
import type { useSearchParams } from 'react-router-dom'
import { useProjects } from './useProjects'
import type { ProjectDTO } from '../api/types'

const LAST_PROJECT_KEY = 'bdt.lastProjectId'

type SetSearchParams = ReturnType<typeof useSearchParams>[1]

export function useProjectSelection(searchParams: URLSearchParams, setSearchParams: SetSearchParams) {
  const { data: projectsData } = useProjects({ limit: 20 })
  const projects = projectsData?.items ?? []

  const paramId = searchParams.get('project_id')
  const activeProject = paramId
    ? projects.find(p => p.id === Number(paramId)) ?? null
    : null

  // Resolve a project when the URL doesn't already name a valid one:
  // remembered choice from a previous visit, else the first project.
  useEffect(() => {
    if (activeProject || projects.length === 0) return
    const remembered = sessionStorage.getItem(LAST_PROJECT_KEY)
    const rememberedProject = remembered
      ? projects.find(p => p.id === Number(remembered))
      : undefined
    const fallback = rememberedProject ?? projects[0]
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('project_id', String(fallback.id))
      return next
    }, { replace: true })
  }, [activeProject, projects, setSearchParams])

  function selectProject(project: ProjectDTO) {
    sessionStorage.setItem(LAST_PROJECT_KEY, String(project.id))
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('project_id', String(project.id))
      return next
    }, { replace: true })
  }

  return { projects, activeProject, selectProject }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: exits with no errors. This file has no consumer yet, so there is nothing to browser-test in isolation — end-to-end behavior is verified in Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useProjectSelection.ts
git commit -m "[project-selector-relocate] add useProjectSelection hook"
```

---

### Task 2: Wire `BomList.tsx` off `ProjectContext`

**Files:**
- Modify: `src/pages/BomList.tsx:9` (import), `:475-499` (state + effect), `:680-746` (filter bar + empty states)

**Interfaces:**
- Consumes: `useProjectSelection` from Task 1 — `{ projects, activeProject, selectProject }`.

- [ ] **Step 1: Swap the import**

In `src/pages/BomList.tsx`, change line 9 from:

```typescript
import { useActiveProject } from '../context/ProjectContext'
```

to:

```typescript
import { useProjectSelection } from '../hooks/useProjectSelection'
```

- [ ] **Step 2: Swap the hook call**

Change (around line 475-479):

```typescript
export function BomList() {
  const navigate = useNavigate()
  const { activeProject } = useActiveProject()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
```

to:

```typescript
export function BomList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeProject, projects, selectProject } = useProjectSelection(searchParams, setSearchParams)
  const location = useLocation()
```

(`activeProject` keeps the same name — every downstream read in this file, e.g. `activeProject?.id` at line 501/532/etc., needs no further changes.)

- [ ] **Step 3: Add the Project select to the filter bar**

In the filter bar (around line 680, right before the existing Zone `<select>`), add:

```tsx
<select
  className="border rounded-md bg-white focus:outline-none"
  style={{ height: 30, padding: '0 8px', fontSize: 12, minWidth: 180, borderColor: '#E0E0E0' }}
  value={activeProject?.id ?? ''}
  onChange={e => {
    const project = projects.find(p => p.id === Number(e.target.value))
    if (project) selectProject(project)
  }}
>
  {projects.length === 0
    ? <option value="" disabled>No projects found</option>
    : projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)
  }
</select>
```

- [ ] **Step 4: Update the two "no project" copy strings**

Change (line ~707):

```tsx
{!hasProject && <span style={{ fontSize: 12, color: '#8E8E8E' }}>Select a Project from the header first</span>}
```

to:

```tsx
{!hasProject && <span style={{ fontSize: 12, color: '#8E8E8E' }}>Select a Project first</span>}
```

Change (line ~746):

```tsx
<div style={{ fontSize: 14, fontWeight: 500 }}>Select a Project from the header first</div>
```

to:

```tsx
<div style={{ fontSize: 14, fontWeight: 500 }}>Select a Project first</div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors (confirms no leftover reference to the removed `useActiveProject` import).

- [ ] **Step 6: Manual browser check**

With `npm run dev` running:
1. Visit `http://localhost:5173/bom` directly (fresh tab, clear `sessionStorage` first via devtools if it has a leftover value from earlier testing).
2. Expected: a project auto-selects (first in the list), URL updates to `?project_id=<id>`, the new Project select shows it selected, Zone select populates and is enabled.
3. Change the Project select to a different project. Expected: `zone_id`/`sub_zone_id` clear from the URL, Zone select repopulates for the new project, dispatch list reloads.
4. Visit `http://localhost:5173/bom?zone_id=1` directly. Expected: still auto-resolves a project (via the same fallback), then applies `zone_id=1` if valid for that project.

- [ ] **Step 7: Commit**

```bash
git add src/pages/BomList.tsx
git commit -m "[project-selector-relocate] BomList: resolve project locally via useProjectSelection"
```

---

### Task 3: Wire `ZoneList.tsx` off `ProjectContext`

**Files:**
- Modify: `src/pages/ZoneList.tsx:1` (imports), `:142-166` (state), `:256-323` (header + new filter bar + empty state)

**Interfaces:**
- Consumes: `useProjectSelection` from Task 1, same shape as Task 2.

- [ ] **Step 1: Add `useSearchParams` and swap the project import**

At the top of `src/pages/ZoneList.tsx`, change:

```typescript
import { useState, useEffect } from 'react'
```

to:

```typescript
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
```

and change:

```typescript
import { useActiveProject } from '../context/ProjectContext'
```

to:

```typescript
import { useProjectSelection } from '../hooks/useProjectSelection'
```

- [ ] **Step 2: Swap the hook call**

Change (lines 142-144):

```typescript
export function ZoneList() {
  const { activeProject } = useActiveProject()
  const projectId = activeProject?.id ?? null
```

to:

```typescript
export function ZoneList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeProject, projects, selectProject } = useProjectSelection(searchParams, setSearchParams)
  const projectId = activeProject?.id ?? null
```

(`projectId` and `activeProject` keep their existing names — the `useEffect(() => { setExpandedZone(...) }, [projectId, ...])` and `useEffect(() => { setReorderMode(false) }, [projectId])` effects at lines 161-166, and the Add Zone modal's breadcrumb at line 358, need no further changes.)

- [ ] **Step 3: Remove the header breadcrumb, add a filter-bar row**

Change the header block (lines 258-269) from:

```tsx
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Zones</span>
          {activeProject && (
            <>
              <span style={{ color: '#C2C2C2' }}>·</span>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#C8202A' }}>{activeProject.project_code}</span>
              <span style={{ fontSize: 13, color: '#8E8E8E' }}>{activeProject.name}</span>
            </>
          )}
        </div>
```

to:

```tsx
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Zones</span>
        </div>
```

Then, immediately after the header `</div>` that closes it (right before the `{/* Zone list */}` comment, line ~310), add a new filter-bar row:

```tsx
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-6 border-b border-chrome-100" style={{ height: 44, background: '#F5F5F5', flexShrink: 0 }}>
        <select
          className="border rounded-md bg-white focus:outline-none"
          style={{ height: 30, padding: '0 8px', fontSize: 12, minWidth: 220, borderColor: '#E0E0E0' }}
          value={activeProject?.id ?? ''}
          onChange={e => {
            const project = projects.find(p => p.id === Number(e.target.value))
            if (project) selectProject(project)
          }}
        >
          {projects.length === 0
            ? <option value="" disabled>No projects found</option>
            : projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)
          }
        </select>
      </div>
```

- [ ] **Step 4: Update the "no project" empty-state copy**

Change (line ~314):

```tsx
            Select a Project from the dropdown above first
```

to:

```tsx
            Select a Project above
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Manual browser check**

With `npm run dev` running:
1. Clear `sessionStorage`, visit `http://localhost:5173/zones` directly. Expected: first project auto-selects, URL gets `?project_id=`, zone list loads, new filter bar shows the select with that project chosen.
2. Change the Project select. Expected: zone list reloads for the new project, `expandedZone` resets to the new list's first zone (or none), reorder mode exits if it was active.
3. Confirm "Add Zone" and "Reorder" buttons still only show when a project is active, and the Add Zone modal's "Project: ..." breadcrumb still shows correctly.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ZoneList.tsx
git commit -m "[project-selector-relocate] ZoneList: resolve project locally via useProjectSelection"
```

---

### Task 4: Remove the Project dropdown from `Topbar.tsx`

**Files:**
- Modify: `src/components/layout/Topbar.tsx:1-45` (imports/state/effects), `:69-138` (center block)

**Interfaces:**
- None — this task only removes code, no new interface.

- [ ] **Step 1: Trim imports and state**

Change lines 1-19 from:

```typescript
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, ChevronDown, FolderOpen, Check, Plus, User, Settings, Keyboard, LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useActiveProject } from '../../context/ProjectContext'
import { useProjects } from '../../hooks/useProjects'

interface Props {
  onMobileMenuToggle: () => void
}

export function Topbar({ onMobileMenuToggle }: Props) {
  const [projectOpen, setProjectOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const { user, logout } = useAuth()
  const { activeProject, setActiveProject } = useActiveProject()
  const navigate = useNavigate()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: projectsData } = useProjects({ limit: 20 })
  const projectItems = projectsData?.items ?? []

  useEffect(() => {
    if (!activeProject && projectItems.length > 0) {
      setActiveProject(projectItems[0])
    }
  }, [projectItems, activeProject, setActiveProject])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  // Close project dropdown on outside click
  useEffect(() => {
    if (!projectOpen) return
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [projectOpen])
```

to:

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, ChevronDown, Check, User, Settings, Keyboard, LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface Props {
  onMobileMenuToggle: () => void
}

export function Topbar({ onMobileMenuToggle }: Props) {
  const [bellOpen, setBellOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }
```

(`ChevronDown` and `Check` stay imported — both are still used further down, by the user-menu chevron and the notification "Approved" icon respectively. `FolderOpen` and `Plus` are dropped — both were only used inside the block removed in Step 2.)

- [ ] **Step 2: Replace the center block with a spacer**

Change (lines 69-138, the whole `{/* CENTER — project selector */}` block) from the opening comment through its closing `</div>` to:

```tsx
      {/* CENTER spacer */}
      <div className="flex-1" />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors (confirms no dangling references to `projectOpen`, `dropdownRef`, `activeProject`, `projectItems`, etc.).

- [ ] **Step 4: Manual browser check**

With `npm run dev` running, visit any page (e.g. `/`, `/zones`, `/bom`, `/products`). Expected: the top header shows only the logo on the left and search/bell/user on the right — no project button/dropdown anywhere, on any page.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Topbar.tsx
git commit -m "[project-selector-relocate] Topbar: remove global project dropdown"
```

---

### Task 5: Fix `ProjectList.tsx`'s double-click handoff

**Files:**
- Modify: `src/pages/ProjectList.tsx:230`

**Interfaces:**
- None new — uses the `project_id` URL param contract already established by Task 3.

- [ ] **Step 1: Update the double-click handler**

Change (line 230):

```tsx
              onDoubleClick={() => { setActiveProject(p); navigate('/zones') }}
```

to:

```tsx
              onDoubleClick={() => navigate(`/zones?project_id=${p.id}`)}
```

`setActiveProject(p)` is dropped from this call — it existed only to hand off to the old Context-reading `ZoneList`, which no longer reads Context. The single-click `onClick={() => setActiveProject(p)}` a few lines above stays unchanged (still drives this page's own `isActive` card highlight via Context, out of scope).

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Manual browser check**

With `npm run dev` running:
1. Go to `http://localhost:5173/projects`.
2. Double-click a project card that is **not** the one currently remembered in `sessionStorage` (e.g. pick a different one than whatever you last used on `/zones` or `/bom`).
3. Expected: lands on `/zones?project_id=<that card's id>`, and the Project select on `/zones` shows that exact project — not the previously remembered one.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProjectList.tsx
git commit -m "[project-selector-relocate] ProjectList: pass project_id explicitly on zones handoff"
```

---

### Task 6: Full cross-page regression pass

**Files:** none (verification only, per spec §5)

- [ ] **Step 1: Run the full manual scenario checklist**

With `npm run dev` running and a clean `sessionStorage` (clear it once at the start via devtools):

1. `npx tsc -p tsconfig.app.json` — clean.
2. Visit `/zones` fresh → first project auto-selected, URL gets `?project_id=`.
3. Change project via the `/zones` select → zone list reloads, `expandedZone`/reorder state resets.
4. Navigate to `/bom` via the sidebar → same project as the one just active on `/zones` (sessionStorage fallback), confirming the two pages hand off correctly without Context.
5. On `/bom`, change project via its select → `zone_id`/`sub_zone_id` clear, dispatch list reloads; Zone select is disabled with no project, Sub-zone select is disabled/no-op when the chosen zone has no sub-zones.
6. Open a dispatch detail from `/bom`, click "Back to BOM" → lands back on the same project (confirms the sessionStorage fallback covers the untouched back-buttons per spec §3.8).
7. From `/projects`, double-click a *different* project's card → lands on `/zones` with that exact project, not the remembered one.
8. Confirm `Topbar` shows no project UI on any page, and the browser devtools console has no errors from removed imports.
9. Regression: `/` (Dashboard), `/projects` (single-click highlight + create-project flow), `/routing/apply`, `/bom/upload` all still work exactly as before (still Context-driven, untouched by this plan).

- [ ] **Step 2: Note results**

If every scenario above passes with no unexpected behavior, no further code changes are needed — this task closes the plan. If anything fails, fix it in the relevant task's file and re-run the affected scenarios (no separate commit step here; fixes get folded into the task they belong to).

---

## Follow-on (not in this plan)

Tracked in the design spec §6: migrating `Dashboard.tsx`, `RoutingApply.tsx`, `BomUpload.tsx`, and `ProjectList.tsx`'s own Context usage off `ProjectContext`, and eventually deleting `ProjectContext.tsx` once all six consumers are migrated.
