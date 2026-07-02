# Customer/Project/Zone Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guard the 7 currently-unhandled mutations across `CustomerList.tsx`, `ProjectList.tsx`, `ZoneList.tsx` — first real usage of the mutation opt-in mechanism built during the BOM feature — plus migrate `CustomerList.tsx`'s existing `handleDelete` to the shared `getErrorMessage` helper.

**Architecture:** Each mutation gets `meta: { showGlobalErrorToast: true }` at the hook definition (error side, handled by the existing global `MutationCache.onError` in `main.tsx` — unchanged by this plan). Each call site gets a try/catch (empty catch — the global handler already shows the toast; the catch's only job is stopping success-path code from running) + a local `toast.success(...)` on success. One site (`deleteSubMut.mutate(id)`) is fire-and-forget and uses `.mutate()`'s inline `onSuccess` option instead of try/catch, since there's no `await` to wrap.

**Tech Stack:** React 19 + TS (frontend, no test runner — same constraint as Login/BOM) · `@tanstack/react-query` (mutations only touched) · `sonner` (toast) · `src/lib/getErrorMessage.ts` (existing, from Login).

## Global Constraints

- All user-facing copy is **English**.
- No new dependencies.
- The frontend has no test runner — verify via `npx tsc -p tsconfig.app.json` + the manual scenarios in Task 4.
- The query side of these 3 pages is **unchanged** — already covered by the existing global `QueryCache` handler from the BOM feature, confirmed no dedicated error UI exists to conflict with.
- `useDeleteCustomer` is **not** touched — it already has its own local error toast (migrated to `getErrorMessage` in Task 1, but stays local, does NOT get the opt-in meta flag) — a mutation gets exactly one error-signaling mechanism, never both.
- Branch already created: `dev-t-customer-project-zone-error-handling` (cut from `dev`).
- Design spec: `docs/superpowers/specs/2026-07-02-customer-project-zone-error-handling-design.md`.

---

### Task 1: Customer mutations (`useCustomers.ts` + `CustomerList.tsx`)

**Files:**
- Modify: `src/hooks/useCustomers.ts` (full file)
- Modify: `src/pages/CustomerList.tsx:1-6` (imports), `:119-144` (`handleSubmit` + `handleDelete`)

**Interfaces:**
- Consumes: `getErrorMessage(error: unknown, fallback: string): string` from `src/lib/getErrorMessage.ts` (already exists).
- Produces: nothing consumed by later tasks (Task 1, 2, 3 are independent of each other).

- [ ] **Step 1: Replace `useCustomers.ts`**

```ts
// src/hooks/useCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type CreateCustomerPayload,
} from '../api/customers'

export function useCustomers(params?: Parameters<typeof getCustomers>[0]) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => getCustomers(params),
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) => createCustomer(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
    meta: { showGlobalErrorToast: true },
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateCustomerPayload> }) =>
      updateCustomer(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
    meta: { showGlobalErrorToast: true },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}
```

- [ ] **Step 2: Add the `getErrorMessage` import to `CustomerList.tsx`**

Find (lines 1-6):
```tsx
import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Loader2, Building2, Mail, Phone, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../hooks/useCustomers'
import { useConfirm } from '../components/ui/ConfirmDialog'
import type { Customer, CreateCustomerPayload } from '../api/customers'
```

Replace with:
```tsx
import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Loader2, Building2, Mail, Phone, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../hooks/useCustomers'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { getErrorMessage } from '../lib/getErrorMessage'
import type { Customer, CreateCustomerPayload } from '../api/customers'
```

- [ ] **Step 3: Guard `handleSubmit` and migrate `handleDelete`**

Find (lines 119-144):
```tsx
  async function handleSubmit() {
    if (!form.name) return
    if (modal.editing) {
      await updateMut.mutateAsync({ id: modal.editing.id, payload: form })
    } else {
      await createMut.mutateAsync(form)
    }
    setModal({ open: false, editing: null })
  }

  async function handleDelete(c: Customer) {
    const ok = await confirm({
      title: 'Archive customer?',
      message: `"${c.name}" will be archived and hidden from active lists.`,
      variant: 'danger',
      confirmLabel: 'Archive',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(c.id)
      toast.success('Customer archived')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to archive customer — please try again')
      console.error(e)
    }
  }
```

Replace with:
```tsx
  async function handleSubmit() {
    if (!form.name) return
    try {
      if (modal.editing) {
        await updateMut.mutateAsync({ id: modal.editing.id, payload: form })
        toast.success('Customer updated')
      } else {
        await createMut.mutateAsync(form)
        toast.success('Customer created')
      }
      setModal({ open: false, editing: null })
    } catch {
      // Global handler (meta.showGlobalErrorToast on the mutation) already showed
      // the error toast — stop here so the modal stays open for the user to retry.
    }
  }

  async function handleDelete(c: Customer) {
    const ok = await confirm({
      title: 'Archive customer?',
      message: `"${c.name}" will be archived and hidden from active lists.`,
      variant: 'danger',
      confirmLabel: 'Archive',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(c.id)
      toast.success('Customer archived')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to archive customer. Please try again.'))
    }
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCustomers.ts src/pages/CustomerList.tsx
git commit -m "[customer-project-zone-error-handling] guard customer create/update, migrate delete to getErrorMessage"
```

---

### Task 2: Project mutation (`useProjects.ts` + `ProjectList.tsx`)

**Files:**
- Modify: `src/hooks/useProjects.ts` (full file)
- Modify: `src/pages/ProjectList.tsx:1-8` (imports), `:151-157` (`handleSubmit`)

**Interfaces:**
- Consumes: nothing (independent of Task 1 and 3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace `useProjects.ts`**

```ts
// src/hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '../api/projects'
import type { CreateProjectPayload } from '../api/projects'

export function useProjects(params?: Parameters<typeof projectsApi.list>[0]) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.list(params),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => projectsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
    meta: { showGlobalErrorToast: true },
  })
}
```

- [ ] **Step 2: Add the `toast` import to `ProjectList.tsx`**

Find (lines 1-8):
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, Plus, FolderOpen, Building2, Calendar } from 'lucide-react'
import { useProjects, useCreateProject } from '../hooks/useProjects'
import { useCustomers } from '../hooks/useCustomers'
import { useActiveProject } from '../context/ProjectContext'
import type { CreateProjectPayload } from '../api/projects'
import type { ProjectDTO } from '../api/types'
```

Replace with:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, Plus, FolderOpen, Building2, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { useProjects, useCreateProject } from '../hooks/useProjects'
import { useCustomers } from '../hooks/useCustomers'
import { useActiveProject } from '../context/ProjectContext'
import type { CreateProjectPayload } from '../api/projects'
import type { ProjectDTO } from '../api/types'
```

- [ ] **Step 3: Guard `handleSubmit`**

Find (lines 151-157):
```tsx
  async function handleSubmit() {
    setTouched(true)
    if (!isValid) return
    const created = await createMut.mutateAsync(form as CreateProjectPayload)
    setModalOpen(false)
    setActiveProject(created)
  }
```

Replace with:
```tsx
  async function handleSubmit() {
    setTouched(true)
    if (!isValid) return
    try {
      const created = await createMut.mutateAsync(form as CreateProjectPayload)
      toast.success('Project created')
      setModalOpen(false)
      setActiveProject(created)
    } catch {
      // Global handler (meta.showGlobalErrorToast on the mutation) already showed
      // the error toast — stop here so the modal stays open for the user to retry.
    }
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProjects.ts src/pages/ProjectList.tsx
git commit -m "[customer-project-zone-error-handling] guard project create"
```

---

### Task 3: Zone + sub-zone mutations (`useProjectZones.ts` + `useSubZones.ts` + `ZoneList.tsx`)

**Files:**
- Modify: `src/hooks/useProjectZones.ts` (full file)
- Modify: `src/hooks/useSubZones.ts` (full file)
- Modify: `src/pages/ZoneList.tsx:1-2` (imports), `:191-229` (`saveReorder`, `handleCreateZone`, `handleCreateSub`), `:322` (`onDeleteSub`)

**Interfaces:**
- Consumes: nothing (independent of Task 1 and 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace `useProjectZones.ts`**

```ts
// src/hooks/useProjectZones.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectZonesApi } from '../api/project-zones'
import type { CreateZonePayload } from '../api/project-zones'

export function useProjectZones(projectId: number | undefined) {
  return useQuery({
    queryKey: ['project-zones', projectId],
    queryFn: () => projectZonesApi.list(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateZone(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateZonePayload) => projectZonesApi.create(projectId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-zones', projectId] }),
    meta: { showGlobalErrorToast: true },
  })
}

export function useUpdateZone(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ zoneId, payload }: { zoneId: number; payload: { erection_sequence?: number; label?: string } }) =>
      projectZonesApi.update(projectId, zoneId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-zones', projectId] }),
    meta: { showGlobalErrorToast: true },
  })
}
```

- [ ] **Step 2: Replace `useSubZones.ts`**

```ts
// src/hooks/useSubZones.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSubZones, createSubZone, updateSubZone, deleteSubZone } from '../api/sub-zones'

export function useSubZones(zoneId: number | null) {
  return useQuery({
    queryKey: ['sub-zones', zoneId],
    queryFn: () => getSubZones(zoneId!),
    enabled: zoneId != null,
  })
}

export function useCreateSubZone(zoneId: number, projectId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; code?: string; start_date?: string; due_date?: string }) => createSubZone(zoneId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-zones', zoneId] })
      if (projectId) qc.invalidateQueries({ queryKey: ['project-zones', projectId] })
    },
    meta: { showGlobalErrorToast: true },
  })
}

export function useUpdateSubZone(zoneId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name?: string; code?: string } }) =>
      updateSubZone(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-zones', zoneId] }),
  })
}

export function useDeleteSubZone(zoneId: number, projectId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteSubZone(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-zones', zoneId] })
      if (projectId) qc.invalidateQueries({ queryKey: ['project-zones', projectId] })
    },
    meta: { showGlobalErrorToast: true },
  })
}
```

Note: `useUpdateSubZone` is unchanged (not in scope — it has no known call site being guarded in this plan; if you discover during implementation that it IS called unguarded somewhere, STOP and report back — do not silently add scope).

- [ ] **Step 3: Add the `toast` import to `ZoneList.tsx`**

Find (lines 1-2):
```tsx
import { useState, useEffect } from 'react'
import { Plus, Loader2, ChevronDown, GripVertical, Check, X } from 'lucide-react'
```

Replace with:
```tsx
import { useState, useEffect } from 'react'
import { Plus, Loader2, ChevronDown, GripVertical, Check, X } from 'lucide-react'
import { toast } from 'sonner'
```

- [ ] **Step 4: Guard `saveReorder`, `handleCreateZone`, `handleCreateSub`**

Find (lines 191-229):
```tsx
  async function saveReorder() {
    setSavingReorder(true)
    await Promise.all(
      orderedIds.map((id, idx) =>
        updateZoneMut.mutateAsync({ zoneId: id, payload: { erection_sequence: idx + 1 } })
      )
    )
    setSavingReorder(false)
    setReorderMode(false)
  }

  function openZoneModal() {
    const nextSeq = zoneList.length > 0
      ? Math.max(...zoneList.map(z => z.erection_sequence ?? 0)) + 1
      : 1
    setZoneForm({ code: '', label: '', erection_sequence: nextSeq })
    setZoneTouched(false)
    setZoneModal(true)
  }

  async function handleCreateZone() {
    setZoneTouched(true)
    if (!zoneForm.code?.trim() || !zoneForm.label?.trim() || !projectId) return
    const created = await createZoneMut.mutateAsync(zoneForm as CreateZonePayload)
    setZoneModal(false)
    setExpandedZone(created.id)
  }

  async function handleCreateSub() {
    if (!subForm.name || !subModal.zoneId) return
    await createSubMut.mutateAsync({
      name: subForm.name,
      code: subForm.code || undefined,
      start_date: subForm.start_date || undefined,
      due_date: subForm.due_date || undefined,
    })
    setSubModal({ open: false, zoneId: null })
    setSubForm({ name: '', code: '', start_date: '', due_date: '' })
  }
```

Replace with:
```tsx
  async function saveReorder() {
    setSavingReorder(true)
    try {
      await Promise.all(
        orderedIds.map((id, idx) =>
          updateZoneMut.mutateAsync({ zoneId: id, payload: { erection_sequence: idx + 1 } })
        )
      )
      toast.success('Zone order saved')
      setReorderMode(false)
    } catch {
      // Global handler (meta.showGlobalErrorToast on the mutation) already showed
      // the error toast — stay in reorder mode so the user can retry.
    } finally {
      setSavingReorder(false)
    }
  }

  function openZoneModal() {
    const nextSeq = zoneList.length > 0
      ? Math.max(...zoneList.map(z => z.erection_sequence ?? 0)) + 1
      : 1
    setZoneForm({ code: '', label: '', erection_sequence: nextSeq })
    setZoneTouched(false)
    setZoneModal(true)
  }

  async function handleCreateZone() {
    setZoneTouched(true)
    if (!zoneForm.code?.trim() || !zoneForm.label?.trim() || !projectId) return
    try {
      const created = await createZoneMut.mutateAsync(zoneForm as CreateZonePayload)
      toast.success('Zone created')
      setZoneModal(false)
      setExpandedZone(created.id)
    } catch {
      // Global handler (meta.showGlobalErrorToast on the mutation) already showed
      // the error toast — stop here so the modal stays open for the user to retry.
    }
  }

  async function handleCreateSub() {
    if (!subForm.name || !subModal.zoneId) return
    try {
      await createSubMut.mutateAsync({
        name: subForm.name,
        code: subForm.code || undefined,
        start_date: subForm.start_date || undefined,
        due_date: subForm.due_date || undefined,
      })
      toast.success('Sub-zone created')
      setSubModal({ open: false, zoneId: null })
      setSubForm({ name: '', code: '', start_date: '', due_date: '' })
    } catch {
      // Global handler (meta.showGlobalErrorToast on the mutation) already showed
      // the error toast — stop here so the modal stays open for the user to retry.
    }
  }
```

- [ ] **Step 5: Guard the fire-and-forget `onDeleteSub`**

Find (line 322):
```tsx
                    onDeleteSub={id => deleteSubMut.mutate(id)}
```

Replace with:
```tsx
                    onDeleteSub={id => deleteSubMut.mutate(id, { onSuccess: () => toast.success('Sub-zone deleted') })}
```

(The error side needs no change here — `useDeleteSubZone`'s `meta: { showGlobalErrorToast: true }` from Step 2 already covers it; `.mutate()` goes through the same `MutationCache` as `.mutateAsync()`.)

- [ ] **Step 6: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useProjectZones.ts src/hooks/useSubZones.ts src/pages/ZoneList.tsx
git commit -m "[customer-project-zone-error-handling] guard zone reorder/create + sub-zone create/delete"
```

---

### Task 4: Manual verification (all 7 scenarios)

**Files:** none (verification only)

**Interfaces:**
- Consumes: the complete result of Tasks 1-3 together.

- [ ] **Step 1: Start both dev servers**

Run (backend, `backend/`): `npm run start:dev`
Run (frontend, repo root): `npm run dev`

- [ ] **Step 2: Customer create/update failure**

Stop the backend. Open `/customers`, try to create a new customer, then try to edit an existing one. Expected: toast on each attempt, modal stays open both times.

- [ ] **Step 3: Customer archive failure**

Still with backend stopped, try to archive a customer. Expected: toast "Failed to archive customer. Please try again." (or the backend's own message if reachable).

- [ ] **Step 4: Project create failure**

Still with backend stopped, open `/projects`, try to create a project. Expected: toast, modal stays open, active project selector unchanged.

- [ ] **Step 5: Zone reorder / create / sub-zone create / sub-zone delete failures**

Still with backend stopped, on `/zones`: try reordering zones (drag two rows, save), try creating a zone, try creating a sub-zone, try deleting a sub-zone. Expected: toast on each of the 4, reorder mode stays active with the "saving" state cleared (not stuck), zone/sub-zone modals stay open on their respective failures.

- [ ] **Step 6: Full regression pass**

Restart the backend. Repeat all 7 actions (customer create, customer update, customer archive, project create, zone reorder, zone create, sub-zone create, sub-zone delete — that's 8 individual actions covering the 7 mutations) successfully. Expected: each shows its success toast, data persists (reload the page to confirm), no console errors.
