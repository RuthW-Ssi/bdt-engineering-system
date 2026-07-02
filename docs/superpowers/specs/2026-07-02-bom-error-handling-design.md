# Design — BOM error handling (pages with no error handling)

**Date:** 2026-07-02
**Author:** bdtapp@ssi-steel.com + Claude
**Status:** Approved design, pending implementation plan
**Repo:** `bdt-app` · branch `dev-t-bom-error-handling`

---

## 1. Context & Problem

Second feature of the repo-wide error-handling initiative (first was Login,
`docs/superpowers/specs/2026-07-02-login-error-handling-design.md`). BOM spans
8 frontend pages + 2 backend modules — too large for one pass. This spec
covers only the 4 pages confirmed to have **zero** error handling
(`grep` confirmed 0 toast calls, 0 try-blocks in each):

- `src/pages/BomList.tsx` (872 lines)
- `src/pages/BomEditor.tsx` (500 lines)
- `src/pages/BomDiffReview.tsx` (295 lines)
- `src/pages/BomDispatchDetail.tsx` (137 lines)

These 4 pages split into two underlying data-fetching patterns:

- **Real `@tanstack/react-query`** (`src/hooks/useBomDispatches.ts`, confirmed
  a genuine dependency and genuine `useQuery`/`useMutation` usage — not
  hand-rolled) — consumed by `BomList.tsx` and `BomDispatchDetail.tsx`.
- **Hand-rolled hooks** (`useState`/`useEffect`, no react-query) —
  `src/hooks/useBom.ts` (consumed by `BomEditor.tsx`) and
  `src/hooks/useBomDiff.ts` (consumed by `BomDiffReview.tsx`).

Because react-query is already the app's dependency, it supports a **global**
`QueryCache`/`MutationCache` `onError` handler — one fix in `main.tsx` that
covers every current and future page using `useQuery`/`useMutation`
app-wide (not just these two), reusing the `getErrorMessage` helper built
for Login. The hand-rolled hooks can't benefit from that and need the same
manual treatment `AuthContext.tsx` got.

**Confirmed gaps (traced to exact file:line):**

| File | Gap |
|---|---|
| `BomList.tsx:752` | `isError \|\| allItems.length === 0` renders the **identical** "No BOM dispatches yet · Upload First BOM" empty state for a real fetch failure and genuine empty data — actively misleading (encourages uploading when the server may be down). |
| `BomList.tsx:592-593` | `useDispatchDetail`/`usePaintConfig` — only `isLoading` destructured, `isError` ignored; failure renders as if the dispatch simply has no data. |
| `BomList.tsx:501,515` | `useProjectZones`/`useSubZones` — no error state destructured at all. |
| `BomEditor.tsx:229-236` | `handleQtyChange` — `await updateLineQty(...)`, no try/catch. |
| `BomEditor.tsx:239-248` | `handleActivate` — try/**finally**, no catch; `activateBom()` failure propagates unhandled, and `finally` resets the button so the user sees no error at all. |
| `BomEditor.tsx:250-257` | `handleDelete` — `await deleteLineById(...)`, no try/catch. |
| `useBomDiff.ts:108-116, 128-134` | Both `.then()` chains have **no `.catch()`** — a rejected promise is a silent unhandled rejection; no `error` field exists on the hook's return type at all. |
| `BomDispatchDetail.tsx` | Already renders dedicated error states ("Not found", "Unable to load diff data") for `useDispatchDetail`/`useDispatchDiff` — no raw gap, just not on the toast convention. |

**Explicitly out of scope:** `BomDiffReview.tsx`'s Approve/Reject buttons
(lines ~241-247, ~282-288) have no `onClick` wired to any endpoint at all —
this is an unfinished feature, not a silent-failure gap. Flagged as a
follow-up, not touched here.

---

## 2. Goals / Non-goals

**Goals**
- One global react-query error handler (`main.tsx`) using `getErrorMessage`,
  covering every `useQuery`/`useMutation` failure app-wide by default.
- An opt-out (`meta: { skipGlobalErrorToast: true }`) for queries that
  already render their own dedicated error UI, so failures aren't
  double-signaled (toast + inline error screen at once).
- `useBom.ts`'s three unguarded mutations get try/catch + toast, matching
  the `AuthContext.login()` pattern from Login.
- `useBomDiff.ts` gains an `error` field (mirroring `useBom.ts`'s shape) and
  both its fetch chains get `.catch()` + toast.
- `BomList.tsx`'s empty-state vs error-state are visually distinguished.

**Non-goals**
- Not touching `BomUpload.tsx`, `BomPaintConfig.tsx`, `BomRoutingConfig.tsx`,
  `BomWireConfig.tsx` — these already have partial toast/try-catch coverage;
  a future pass in this initiative may audit them for completeness.
- Not touching the `boms` backend module (assemblies/explosion services) —
  this pass is frontend-only; backend BOM error handling (`bom-upload`
  module) was already found to be in decent shape (typed exceptions +
  `Logger` in 3 services) during the initial scoping pass.
- Not wiring up `BomDiffReview`'s Approve/Reject buttons (see above).
- Not adding a frontend test framework — same constraint as Login; this repo
  has none configured, verification is type-checking + manual browser pass.

---

## 3. Design

### 3.1 Global handler — `src/main.tsx`

```ts
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from './lib/getErrorMessage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.skipGlobalErrorToast) return
      toast.error(getErrorMessage(error, 'Failed to load data. Please try again.'))
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.skipGlobalErrorToast) return
      toast.error(getErrorMessage(error, 'Action failed. Please try again.'))
    },
  }),
})
```

React-query v5 types `meta` as `Record<string, unknown> | undefined` by
default — reading `.skipGlobalErrorToast` off it needs a `Register` module
augmentation (`declare module '@tanstack/react-query' { interface Register {
queryMeta: { skipGlobalErrorToast?: boolean }; mutationMeta: {
skipGlobalErrorToast?: boolean } } }`) somewhere in the frontend source (e.g.
alongside this file) for `tsc` to accept it without a cast.

### 3.2 Opt-out — `src/hooks/useBomDispatches.ts`

`useDispatchDetail` and `useDispatchDiff` (consumed by `BomDispatchDetail.tsx`,
which already renders dedicated "Not found"/"Unable to load diff data"
screens) get `meta: { skipGlobalErrorToast: true }` added to their `useQuery`
options, so the global handler skips them. Every other query/mutation in this
file (including the ones `BomList.tsx` uses) keeps the default toast.

### 3.3 `src/hooks/useBom.ts` — guard the 3 mutations

`updateLineQty` and `deleteLineById` wrap their `await` in try/catch,
rethrowing after a `toast.error(getErrorMessage(err, '...'))` call (matching
`AuthContext.login()`'s log-then-rethrow shape, but with a toast instead of
`console.error` since there's no sensitive data here to worry about hiding —
unlike Login, these errors don't carry credentials). `BomEditor.tsx`'s
`handleActivate` gets an explicit `catch` block added (currently
try/**finally** only) around `activateBom(bom.id)`.

### 3.4 `src/hooks/useBomDiff.ts` — expose `error`, add `.catch()`

Add `error: string | null` to `UseBomDiffResult` (mirroring `useBom.ts`).
Both `.then()` chains (list load, diff compute) get a `.catch()` that sets
`error` and shows `toast.error(getErrorMessage(err, 'Failed to load BOM
diff.'))`. `BomDiffReview.tsx` renders a dedicated error state when `error`
is set (matching the existing pattern already used for the initial-load
error in `BomEditor.tsx`), rather than relying on the global toast alone —
consistent with "give dedicated error UI to page-load failures, toast to
transient/mutation failures."

### 3.5 `src/pages/BomList.tsx` — split empty vs error state

Line 752's combined `isError || allItems.length === 0` branch splits into
two: `isError` renders a distinct message ("Unable to load BOM dispatches")
+ a **Retry** button (`refetch()`) instead of "Upload First BOM"; the
`allItems.length === 0` (no error) branch keeps the existing empty-state
copy and upload CTA unchanged.

---

## 4. Error case matrix

| Case | Where | Signal |
|---|---|---|
| BomList dispatch fetch fails | `useDispatches` (react-query) | Global toast + distinct "Unable to load" empty-state (not "Upload First BOM") |
| BomList dispatch-detail/paint-config fetch fails | `useDispatchDetail`/`usePaintConfig` (react-query) | Global toast only (no dedicated screen existed before, none added — global toast is the fix) |
| BomDispatchDetail fetch fails | `useDispatchDetail`/`useDispatchDiff` (react-query, opted out) | Existing dedicated error screen only — no duplicate toast |
| BomEditor: qty change / delete line fails | `useBom.ts` mutations | Toast (mutation-triggered, transient) |
| BomEditor: activate fails | `useBom.ts` / `handleActivate` | Toast (mutation-triggered, transient) |
| BomDiffReview: list/diff fetch fails | `useBomDiff.ts` (hand-rolled) | Dedicated error state (page-load failure) + toast |

---

## 5. Verification (manual — no frontend test runner in this repo)

1. Global handler: stop the backend, trigger a query on a react-query page
   (e.g. `BomList`) → toast shows connection-error copy.
2. Global handler: trigger a mutation failure (e.g. `BomList`'s
   `useSaveAssemblyMatch`) → toast shows.
3. Opt-out: force `BomDispatchDetail`'s dispatch fetch to 404 → only the
   existing dedicated error screen shows, **no** duplicate toast.
4. `BomEditor`: fail a qty change (e.g. stop backend mid-edit) → toast, no
   silent failure, tree doesn't optimistically show the wrong value.
5. `BomEditor`: fail Activate → toast, button returns to normal state (not
   stuck), no silent no-op.
6. `BomEditor`: fail delete-line → toast.
7. `BomDiffReview`: fail the list/diff fetch → dedicated error state renders
   (not a blank "nothing to show" page) + toast.
8. `BomList`: force a real fetch error vs. a genuinely-empty project →
   confirm the two states now read differently (error message + Retry vs.
   "No BOM dispatches yet" + Upload CTA).

---

## 6. Follow-on (not in this pass)

- Next candidates in the error-handling initiative: `BomUpload.tsx` /
  `BomPaintConfig.tsx` / `BomRoutingConfig.tsx` / `BomWireConfig.tsx` audit
  (partial coverage today, may just need consistency pass reusing
  `getErrorMessage` instead of ad-hoc messages) — order TBD with the user.
- `BomDiffReview`'s Approve/Reject buttons need wiring to a backend
  endpoint — separate feature task, not error-handling.
- The `boms` backend module (assemblies/explosion services) hasn't been
  audited for error handling — deferred.
