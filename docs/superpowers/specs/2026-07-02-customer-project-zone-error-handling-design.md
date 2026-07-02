# Design — Customer/Project/Zone error handling

**Date:** 2026-07-02
**Author:** bdtapp@ssi-steel.com + Claude
**Status:** Approved design, pending implementation plan
**Repo:** `bdt-app` · branch `dev-t-customer-project-zone-error-handling`

---

## 1. Context & Problem

Third feature of the repo-wide error-handling initiative (Login, then BOM, both shipped to `main`). This pass covers `CustomerList.tsx`, `ProjectList.tsx`, `ZoneList.tsx` — 7 mutations that currently have **zero** error handling, plus one existing handler using an old ad-hoc pattern.

All 4 underlying hooks (`useCustomers.ts`, `useProjects.ts`, `useProjectZones.ts`, `useSubZones.ts`) use genuine `@tanstack/react-query` (`useQuery`/`useMutation`), confirmed via grep — none have their own `onError`. None of the 3 pages destructure or render `isError` anywhere (confirmed via grep) — meaning **the query side needs zero changes**: the global `QueryCache.onError` handler built during the BOM feature already covers every query in these 3 pages for free (opt-out, no conflicting dedicated error UI to worry about, unlike `BomDispatchDetail`).

**Confirmed gaps (traced to exact file:line):**

| File | Mutation | Gap |
|---|---|---|
| `CustomerList.tsx:119-127` (`handleSubmit`) | create/update customer | No try/catch at all — `updateMut.mutateAsync`/`createMut.mutateAsync` unguarded. |
| `CustomerList.tsx:129-144` (`handleDelete`) | archive customer | Has try/catch + success/error toast already, but the catch uses `e?.response?.data?.message ?? '...'` — the old ad-hoc pattern, not the shared `getErrorMessage` helper built during Login. |
| `ProjectList.tsx:151-157` (`handleSubmit`) | create project | No try/catch — `createMut.mutateAsync` unguarded. |
| `ZoneList.tsx:191-200` (`saveReorder`) | reorder zones (`Promise.all` of N updates) | No try/catch. Also has a manual `savingReorder` state that must reset on failure too, or the UI gets stuck — needs `finally`, not just `catch`. |
| `ZoneList.tsx:211-217` (`handleCreateZone`) | create zone | No try/catch — `createZoneMut.mutateAsync` unguarded. |
| `ZoneList.tsx:219-229` (`handleCreateSub`) | create sub-zone | No try/catch — `createSubMut.mutateAsync` unguarded. |
| `ZoneList.tsx:322` (`onDeleteSub={id => deleteSubMut.mutate(id)}`) | delete sub-zone | Fire-and-forget `.mutate()` inline prop callback, not `.mutateAsync()` — no local promise to wrap in try/catch. No `onSuccess`/`onError` at the call site. **Found during plan-writing, after this spec's first draft** — not in the original 6-site count below; corrected to 7 throughout. |

None of `ProjectList.tsx` or `ZoneList.tsx` currently import `toast` from `sonner` at all — both need the import added.

---

## 2. Goals / Non-goals

**Goals**
- Guard all 7 currently-unhandled mutations so a failure doesn't silently continue into success-path code (closing modals, resetting forms, navigating) and doesn't fail silently for the user.
- Add a success toast for each of the 6, matching the copy style already established by `CustomerList.tsx`'s existing `handleDelete` (`toast.success('Customer archived')`).
- Migrate `CustomerList.tsx`'s existing `handleDelete` catch to use the shared `getErrorMessage` helper instead of the old ad-hoc `e?.response?.data?.message` extraction.
- **Activate the mutation opt-in mechanism for the first time.** The global `MutationCache.onError` handler (built during BOM, opt-in via `meta.showGlobalErrorToast`) has had zero call sites using it since it shipped — every one of these 7 mutations is exactly the case it was designed for (new/unhandled mutation, no existing local error toast to conflict with).

**Non-goals**
- Not touching the query side of any of these 3 pages — already covered for free by the existing global `QueryCache` handler, confirmed no dedicated error UI exists to conflict with.
- Not touching any other page's mutations in this pass.
- Not adding a frontend test framework — same constraint as Login/BOM; verification is `npx tsc` + manual browser pass.

---

## 3. Design

### 3.1 Hook-level opt-in — `showGlobalErrorToast: true`

Add `meta: { showGlobalErrorToast: true }` as a sibling property to the 7 mutation definitions:
- `useCustomers.ts`: `useCreateCustomer`, `useUpdateCustomer`
- `useProjects.ts`: `useCreateProject`
- `useProjectZones.ts`: `useCreateZone`, `useUpdateZone`
- `useSubZones.ts`: `useCreateSubZone`, `useDeleteSubZone`

`useDeleteCustomer` (used by `handleDelete`) does **not** get this — it already has its own local error toast, and per the design established during BOM, a mutation should have exactly one error-signaling mechanism, never both.

### 3.2 Component-level guard — try/catch (empty catch) + success toast

For each of the 6 await-able call sites (the 7th, delete sub-zone, is fire-and-forget — see below), wrap the `mutateAsync` call(s) in try/catch. The catch block is **intentionally empty** (no `toast.error` inside) — the global handler (3.1) already shows the error toast; the catch's only job is to stop success-path code from running after a failure (closing a modal, resetting a form, navigating). On success, add `toast.success('<action>')` immediately after the await, matching `handleDelete`'s existing style.

`ZoneList.tsx`'s `saveReorder` is the one exception: it has a manual `savingReorder` boolean that must reset regardless of outcome, so it needs `try { ... } finally { setSavingReorder(false) }` (the `setReorderMode(false)` line, which is genuinely success-only UI collapse, moves inside the `try` after the `Promise.all`, not the `finally`).

**Delete sub-zone (the 7th site) is fire-and-forget** — `onDeleteSub={id => deleteSubMut.mutate(id)}` has no `await`, so there's no local promise to wrap in try/catch. `useDeleteSubZone` still gets `meta: { showGlobalErrorToast: true }` (3.1) for the error side. For the success toast, use `.mutate()`'s inline per-call options instead of a component-level `try`: `deleteSubMut.mutate(id, { onSuccess: () => toast.success('Sub-zone deleted') })`. There's nothing to "stay open" on failure here (no modal involved — it's a delete button in a list row), so no failure-path UI concern.

### 3.3 `handleDelete` migration — `getErrorMessage`

`CustomerList.tsx:140-142` changes from:
```ts
} catch (e: any) {
  toast.error(e?.response?.data?.message ?? 'Failed to archive customer — please try again')
  console.error(e)
}
```
to:
```ts
} catch (e) {
  toast.error(getErrorMessage(e, 'Failed to archive customer. Please try again.'))
}
```
Dropping the `console.error(e)` — per the Login/BOM security review's now-established convention, logging the raw caught object is a leak risk (`AxiosError.config` can carry the `Authorization` header), and this file has no existing precedent of a *safe* console log to preserve.

---

## 4. Error case matrix

| Case | Mechanism | Signal |
|---|---|---|
| Create/update customer fails | Global toast (opt-in) | Toast + modal stays open (empty catch stops the close) |
| Archive customer fails | Local catch + `getErrorMessage` | Toast (migrated copy, same as before) |
| Create project fails | Global toast (opt-in) | Toast + modal stays open, active project unchanged |
| Reorder zones fails (any of N) | Global toast (opt-in) | Toast + `savingReorder` resets (via `finally`) so the UI doesn't get stuck, reorder mode stays active so the user can retry |
| Create zone fails | Global toast (opt-in) | Toast + modal stays open |
| Create sub-zone fails | Global toast (opt-in) | Toast + modal stays open, form not reset |
| Delete sub-zone fails | Global toast (opt-in) | Toast only — no modal/form involved (list-row delete button) |
| Any of the 7, on success | Local `toast.success(...)` (or `.mutate()`'s inline `onSuccess` for the fire-and-forget case) | Toast + existing success-path UI (close modal / navigate / etc.) runs |

---

## 5. Verification (manual — no frontend test runner in this repo)

1. Type-check: `npx tsc -p tsconfig.app.json`.
2. Create/update/archive a customer with the backend stopped → toast on each, no crash, modal stays open on failure.
3. Create a project with backend stopped → toast, modal stays open, active project unchanged.
4. Reorder zones with backend stopped → toast, "saving" indicator clears (not stuck), reorder mode stays active.
5. Create a zone / sub-zone with backend stopped → toast, modal stays open.
6. Delete a sub-zone with backend stopped → toast, list row unaffected.
7. Full regression with backend running: all 7 actions succeed normally, each shows its success toast, existing `handleDelete` behavior unchanged (still works, just uses the shared helper now).

---

## 6. Follow-on (not in this pass)

- Next candidates in the initiative: `BomUpload.tsx`/`BomPaintConfig.tsx`/etc. (still deferred from the BOM pass), or other pages with unhandled mutations not yet audited.
