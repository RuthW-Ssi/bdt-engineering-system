# BOM Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the 4 BOM pages with zero error handling (`BomList.tsx`, `BomEditor.tsx`, `BomDiffReview.tsx`, `BomDispatchDetail.tsx`) using two strategies matched to their underlying data layer: a global react-query `onError` handler for the two pages that use real `@tanstack/react-query`, and manual try/catch + toast for the two hand-rolled hooks.

**Architecture:** `main.tsx` gains a `QueryCache`/`MutationCache` `onError` that shows `toast.error(getErrorMessage(...))` for every query/mutation failure app-wide, with an opt-out (`meta.skipGlobalErrorToast`) for queries that already render dedicated error UI. `useBom.ts` and `useBomDiff.ts` (hand-rolled, no react-query) get try/catch + toast added directly, matching the `AuthContext.login()` pattern from the Login feature.

**Tech Stack:** React 19 + TS (frontend, no test runner configured — same constraint as Login) · `@tanstack/react-query` v5.100.5 (confirmed a real dependency, verified against installed type definitions) · `sonner` (toast) · `src/lib/getErrorMessage.ts` (already exists, built for Login, reused here unchanged).

## Global Constraints

- All user-facing copy is **English**.
- No new dependencies — reuses `sonner`, `@tanstack/react-query` (already a dependency), and the existing `getErrorMessage` helper.
- Frontend has no test runner — verify via `npx tsc -p tsconfig.app.json` (run from repo root) + the manual scenarios in Task 7.
- Out of scope (do not touch): `BomUpload.tsx`, `BomPaintConfig.tsx`, `BomRoutingConfig.tsx`, `BomWireConfig.tsx`, the `boms` backend module, and `BomDiffReview.tsx`'s Approve/Reject buttons (unwired UI stubs — a separate feature task, not error handling).
- Branch already created: `dev-t-bom-error-handling` (cut from `dev`).
- Design spec: `docs/superpowers/specs/2026-07-02-bom-error-handling-design.md`.

---

### Task 1: Global react-query error handler (`main.tsx`)

**Files:**
- Modify: `src/main.tsx` (full file, shown below)

**Interfaces:**
- Consumes: `getErrorMessage(error: unknown, fallback: string): string` from `src/lib/getErrorMessage.ts` (already exists, from the Login feature).
- Produces: the `Register` module augmentation for `@tanstack/react-query` (`queryMeta`/`mutationMeta` typed as `{ skipGlobalErrorToast?: boolean }`) — consumed by Task 2 (`useBomDispatches.ts`), which sets `meta: { skipGlobalErrorToast: true }` on two queries.

Verified against the installed `@tanstack/query-core@5.100.5` type definitions (not guessed): `QueryCache`'s `onError` callback signature is `(error: DefaultError, query: Query<...>) => void` (2 args); `MutationCache`'s is `(error: DefaultError, variables: unknown, onMutateResult: unknown, mutation: Mutation<...>, context: MutationFunctionContext) => unknown` (5 args — only the 4th, `mutation`, is needed here). The `Register` interface exists specifically for this kind of `meta` augmentation (`declare interface Register {}`, empty by default, meant to be extended via `declare module`).

- [ ] **Step 1: Replace the file contents**

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { toast } from 'sonner'
import './index.css'
import App from './App.tsx'
import { getErrorMessage } from './lib/getErrorMessage'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { skipGlobalErrorToast?: boolean }
    mutationMeta: { skipGlobalErrorToast?: boolean }
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.skipGlobalErrorToast) return
      toast.error(getErrorMessage(error, 'Failed to load data. Please try again.'))
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      if (mutation.meta?.skipGlobalErrorToast) return
      toast.error(getErrorMessage(error, 'Action failed. Please try again.'))
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "[bom-error-handling] add global react-query error handler"
```

---

### Task 2: Opt-out for pages with dedicated error UI (`useBomDispatches.ts`)

**Files:**
- Modify: `src/hooks/useBomDispatches.ts:12-18` and `:28-35`

**Interfaces:**
- Consumes: the `Register`-augmented `meta` field from Task 1 (no import needed — module augmentation is ambient).
- Produces: nothing new consumed by later tasks — `BomDispatchDetail.tsx` itself is untouched by this plan (it already renders correctly; this task only prevents its queries from double-signaling once Task 1 lands).

- [ ] **Step 1: Add the opt-out to `useDispatchDetail`**

Find:
```ts
export function useDispatchDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch', id],
    queryFn: () => dispatchesApi.get(id!),
    enabled: !!id,
  })
}
```

Replace with:
```ts
export function useDispatchDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch', id],
    queryFn: () => dispatchesApi.get(id!),
    enabled: !!id,
    meta: { skipGlobalErrorToast: true },
  })
}
```

- [ ] **Step 2: Add the opt-out to `useDispatchDiff`**

Find:
```ts
export function useDispatchDiff(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch-diff', id],
    queryFn: () => dispatchesApi.getDiff(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}
```

Replace with:
```ts
export function useDispatchDiff(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch-diff', id],
    queryFn: () => dispatchesApi.getDiff(id!),
    enabled: !!id,
    staleTime: 60_000,
    meta: { skipGlobalErrorToast: true },
  })
}
```

Do not change any other function in this file (`useDispatches`, `useDispatchHistory`, `useSaveAssemblyMatch`, `useZoneUploadMode`, `useUploadBom`) — these are consumed by `BomList.tsx` and should keep the default (toast-on-error) behavior from Task 1.

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBomDispatches.ts
git commit -m "[bom-error-handling] opt BomDispatchDetail queries out of global toast"
```

---

### Task 3: Guard BomEditor's 3 mutations (`useBom.ts` + `BomEditor.tsx`)

**Files:**
- Modify: `src/hooks/useBom.ts:1-4` (imports), `:101-111` (the two mutation callbacks)
- Modify: `src/pages/BomEditor.tsx:238-248` (`handleActivate`)

**Interfaces:**
- Consumes: `getErrorMessage` from `src/lib/getErrorMessage.ts`.
- Produces: nothing new — `updateLineQty`/`deleteLineById`'s signatures (`(lineId: number, qty: number) => Promise<void>` / `(lineId: number) => Promise<void>`) are unchanged; they now catch and toast internally instead of throwing, so `BomEditor.tsx`'s existing callers (`handleQtyChange`, `handleDelete`) need **no changes** — they still just `await` the call.

**Design note:** unlike `AuthContext.login()` (Login feature), `updateLineQty`/`deleteLineById` do NOT rethrow after catching — there is no caller-side state that needs to react to the failure (no `finally`, no loading flag to reset), so rethrowing would only produce an unhandled-rejection console warning for no benefit. `handleActivate` is different: it directly calls `activateBom()` (imported from `../api/boms`, not part of `useBom.ts`) and manages its own `activating` state in a `finally`, so its catch lives in `BomEditor.tsx` itself.

- [ ] **Step 1: Add imports to `useBom.ts`**

Find (lines 1-4):
```ts
import { useState, useEffect, useCallback } from 'react'
import { listBoms, getBom, updateBomLine, deleteBomLine } from '../api/boms'
import type { BomDTO, BomListItemDTO, BomView } from '../api/boms'
import type { BomNode, Category } from '../types'
```

Replace with:
```ts
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { listBoms, getBom, updateBomLine, deleteBomLine } from '../api/boms'
import type { BomDTO, BomListItemDTO, BomView } from '../api/boms'
import type { BomNode, Category } from '../types'
import { getErrorMessage } from '../lib/getErrorMessage'
```

- [ ] **Step 2: Guard `updateLineQty` and `deleteLineById`**

Find (lines 101-111):
```ts
  const updateLineQty = useCallback(async (lineId: number, qty: number) => {
    if (!bom) return
    await updateBomLine(bom.id, lineId, { product_qty: qty })
    await load()
  }, [bom, load])

  const deleteLineById = useCallback(async (lineId: number) => {
    if (!bom) return
    await deleteBomLine(bom.id, lineId)
    await load()
  }, [bom, load])
```

Replace with:
```ts
  const updateLineQty = useCallback(async (lineId: number, qty: number) => {
    if (!bom) return
    try {
      await updateBomLine(bom.id, lineId, { product_qty: qty })
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update quantity. Please try again.'))
    }
  }, [bom, load])

  const deleteLineById = useCallback(async (lineId: number) => {
    if (!bom) return
    try {
      await deleteBomLine(bom.id, lineId)
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete line. Please try again.'))
    }
  }, [bom, load])
```

- [ ] **Step 3: Add imports to `BomEditor.tsx`**

Find (lines 1-9):
```tsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCcw, RotateCw, GitBranch, Layers, CheckCircle2, AlertCircle, Plus, ChevronRight, ChevronDown, GripVertical, Edit2, Copy, Trash2, Loader2, Zap } from 'lucide-react'
import * as Icons from 'lucide-react'
import { CAT_META } from '../data/meta'
import { genId } from '../data/utils'
import type { BomNode, Category } from '../types'
import { useBom } from '../hooks/useBom'
import { activateBom } from '../api/boms'
```

Replace with:
```tsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, RotateCcw, RotateCw, GitBranch, Layers, CheckCircle2, AlertCircle, Plus, ChevronRight, ChevronDown, GripVertical, Edit2, Copy, Trash2, Loader2, Zap } from 'lucide-react'
import * as Icons from 'lucide-react'
import { CAT_META } from '../data/meta'
import { genId } from '../data/utils'
import type { BomNode, Category } from '../types'
import { useBom } from '../hooks/useBom'
import { activateBom } from '../api/boms'
import { getErrorMessage } from '../lib/getErrorMessage'
```

- [ ] **Step 4: Guard `handleActivate`**

Find (lines 238-248):
```ts
  const [activating, setActivating] = useState(false)
  async function handleActivate() {
    if (!bom) return
    setActivating(true)
    try {
      await activateBom(bom.id)
      await refresh()
    } finally {
      setActivating(false)
    }
  }
```

Replace with:
```ts
  const [activating, setActivating] = useState(false)
  async function handleActivate() {
    if (!bom) return
    setActivating(true)
    try {
      await activateBom(bom.id)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to activate BOM. Please try again.'))
    } finally {
      setActivating(false)
    }
  }
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBom.ts src/pages/BomEditor.tsx
git commit -m "[bom-error-handling] guard BomEditor's 3 mutations with toast"
```

---

### Task 4: Expose errors from `useBomDiff.ts`

**Files:**
- Modify: `src/hooks/useBomDiff.ts` (full file, shown below)

**Interfaces:**
- Consumes: `getErrorMessage` from `src/lib/getErrorMessage.ts`.
- Produces: `UseBomDiffResult` gains `error: string | null` — consumed by Task 5 (`BomDiffReview.tsx`).

- [ ] **Step 1: Replace the file contents**

```ts
// src/hooks/useBomDiff.ts
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { listBoms, getBom } from '../api/boms'
import type { BomListItemDTO, BomLineDTO } from '../api/boms'
import type { BomDiffNode, DiffState, Category } from '../types'
import { getErrorMessage } from '../lib/getErrorMessage'

function lineKey(line: BomLineDTO): string {
  return line.material ? line.material.default_code : line.sub_product?.product_code ?? String(line.id)
}

function lineCode(line: BomLineDTO): string {
  return line.material?.default_code ?? line.sub_product?.product_code ?? String(line.id)
}

function lineName(line: BomLineDTO): string {
  return line.material?.name ?? line.sub_product?.name ?? ''
}

function lineCategory(_line: BomLineDTO): Category {
  return _line.sub_product ? 'SubAssembly' : 'Part'
}

function lineQtyStr(line: BomLineDTO): string {
  return `${Number(line.product_qty)} ${line.product_uom?.name ?? 'KG'}`
}

export function diffBomLines(oldLines: BomLineDTO[], newLines: BomLineDTO[]): BomDiffNode[] {
  const oldMap = new Map(oldLines.map(l => [lineKey(l), l]))

  const nodes: BomDiffNode[] = []
  const seen = new Set<string>()

  for (const line of newLines) {
    const key = lineKey(line)
    seen.add(key)
    const old = oldMap.get(key)

    let state: DiffState = 'added'
    const changes: { field: string; old: string; newVal: string }[] = []

    if (old) {
      const oldQty = Number(old.product_qty)
      const newQty = Number(line.product_qty)
      const oldScrap = Number(old.scrap_pct)
      const newScrap = Number(line.scrap_pct)

      if (oldQty !== newQty) changes.push({ field: 'qty', old: String(oldQty), newVal: String(newQty) })
      if (oldScrap !== newScrap) changes.push({ field: 'scrap%', old: `${oldScrap}%`, newVal: `${newScrap}%` })

      state = changes.length > 0 ? 'modified' : 'unchanged'
    }

    nodes.push({
      id: `diff-new-${line.id}`,
      code: lineCode(line),
      name: lineName(line),
      category: lineCategory(line),
      state,
      level: 1,
      qty: state === 'modified' && old
        ? `${Number(old.product_qty)} → ${Number(line.product_qty)} ${line.product_uom?.name ?? 'KG'}`
        : lineQtyStr(line),
      changes: changes.length > 0 ? changes : undefined,
      expanded: state === 'modified',
      children: [],
    })
  }

  for (const line of oldLines) {
    const key = lineKey(line)
    if (seen.has(key)) continue
    nodes.push({
      id: `diff-old-${line.id}`,
      code: lineCode(line),
      name: lineName(line),
      category: lineCategory(line),
      state: 'removed',
      level: 1,
      qty: lineQtyStr(line),
      expanded: false,
      children: [],
    })
  }

  return nodes
}

interface UseBomDiffResult {
  bomList: BomListItemDTO[]
  diffNodes: BomDiffNode[]
  fromVersionId: number | null
  toVersionId: number | null
  setFromVersionId: (id: number) => void
  setToVersionId: (id: number) => void
  loading: boolean
  error: string | null
  stats: { added: number; modified: number; removed: number; unchanged: number }
}

export function useBomDiff(productCode: string | undefined): UseBomDiffResult {
  const [bomList, setBomList] = useState<BomListItemDTO[]>([])
  const [fromVersionId, setFromVersionId] = useState<number | null>(null)
  const [toVersionId, setToVersionId] = useState<number | null>(null)
  const [diffNodes, setDiffNodes] = useState<BomDiffNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load BOM list
  useEffect(() => {
    if (!productCode) return
    listBoms(productCode).then(list => {
      setBomList(list)

      // Prefer active BOM, fallback to first draft
      if (list.length >= 2) {
        setFromVersionId(list[list.length - 1].id)
        setToVersionId(list[0].id)
      } else if (list.length === 1) {
        setToVersionId(list[0].id)
      }
    }).catch(err => {
      const msg = getErrorMessage(err, 'Failed to load BOM versions.')
      setError(msg)
      toast.error(msg)
    })
  }, [productCode])

  // Compute diff when versions change
  useEffect(() => {
    if (!toVersionId) return
    setLoading(true)
    setError(null)

    const fetchBoth = fromVersionId
      ? Promise.all([getBom(fromVersionId), getBom(toVersionId)])
      : getBom(toVersionId).then(b => [null, b] as [null, typeof b])

    fetchBoth
      .then(([fromBom, toBom]) => {
        const oldLines = fromBom?.lines ?? []
        const newLines = toBom.lines
        setDiffNodes(diffBomLines(oldLines, newLines))
      })
      .catch(err => {
        const msg = getErrorMessage(err, 'Failed to load BOM diff.')
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [fromVersionId, toVersionId])

  const stats = diffNodes.reduce(
    (acc, n) => { acc[n.state]++; return acc },
    { added: 0, modified: 0, removed: 0, unchanged: 0 },
  )

  return { bomList, diffNodes, fromVersionId, toVersionId, setFromVersionId, setToVersionId, loading, error, stats }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: errors in `src/pages/BomDiffReview.tsx` are NOT expected here (it destructures only fields that still exist — adding `error` to the return type doesn't break an existing destructure that doesn't request it). Expect no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBomDiff.ts
git commit -m "[bom-error-handling] useBomDiff: expose error, add .catch() to both fetches"
```

---

### Task 5: Render the diff error state (`BomDiffReview.tsx`)

**Files:**
- Modify: `src/pages/BomDiffReview.tsx:3` (import), `:104` (hook destructure), `:193-196` (render)

**Interfaces:**
- Consumes: `error: string | null` from Task 4's `useBomDiff(productCode)` return.
- Produces: nothing consumed by later tasks (leaf of this feature).

- [ ] **Step 1: Add the `AlertCircle` import**

Find (line 3):
```tsx
import { ArrowLeft, FileText, Box, XCircle, CheckCircle, PlusCircle, MinusCircle, Edit, Equal, Download, Tag, Clock } from 'lucide-react'
```

Replace with:
```tsx
import { ArrowLeft, FileText, Box, XCircle, CheckCircle, PlusCircle, MinusCircle, Edit, Equal, Download, Tag, Clock, AlertCircle } from 'lucide-react'
```

- [ ] **Step 2: Destructure `error` from the hook**

Find (line 104):
```tsx
  const { bomList, diffNodes, fromVersionId, toVersionId, setFromVersionId, setToVersionId, loading, stats } = useBomDiff(code)
```

Replace with:
```tsx
  const { bomList, diffNodes, fromVersionId, toVersionId, setFromVersionId, setToVersionId, loading, error, stats } = useBomDiff(code)
```

- [ ] **Step 3: Render the error state**

Find (lines 193-196):
```tsx
          {loading
            ? <div className="flex items-center justify-center py-12" style={{ color: '#8E8E8E', gap: 8, fontSize: 13 }}><span>Loading diff...</span></div>
            : diffNodes.map(node => <DiffRow key={node.id} node={node} hideUnchanged={hideUnchanged} />)
          }
```

Replace with:
```tsx
          {loading
            ? <div className="flex items-center justify-center py-12" style={{ color: '#8E8E8E', gap: 8, fontSize: 13 }}><span>Loading diff...</span></div>
            : error
              ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12" style={{ color: '#C8202A' }}>
                  <AlertCircle size={28} />
                  <span style={{ fontSize: 13 }}>{error}</span>
                </div>
              )
              : diffNodes.map(node => <DiffRow key={node.id} node={node} hideUnchanged={hideUnchanged} />)
          }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BomDiffReview.tsx
git commit -m "[bom-error-handling] BomDiffReview: render dedicated error state"
```

---

### Task 6: Split empty vs. error state (`BomList.tsx`)

**Files:**
- Modify: `src/pages/BomList.tsx:752-763`

**Interfaces:**
- Consumes: `isError`, `allItems`, `refetch` — all already destructured in this file (`isError`/`refetch` at line 529, `allItems` at line 541). `RefreshCw` icon already imported (line 3). No new imports needed.
- Produces: nothing consumed by later tasks (leaf of this feature).

- [ ] **Step 1: Split the combined branch**

Find (lines 752-763):
```tsx
      ) : isError || allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>No BOM dispatches yet</div>
          <button
            onClick={() => navigate('/bom/upload')}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 8 }}
          >
            <Upload size={14} />Upload First BOM
          </button>
        </div>
      ) : (
```

Replace with:
```tsx
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>Unable to load BOM dispatches</div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-md"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, color: '#3A3A3A', border: '1px solid #C2C2C2', marginTop: 8 }}
          >
            <RefreshCw size={14} />Retry
          </button>
        </div>
      ) : allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>No BOM dispatches yet</div>
          <button
            onClick={() => navigate('/bom/upload')}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 8 }}
          >
            <Upload size={14} />Upload First BOM
          </button>
        </div>
      ) : (
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BomList.tsx
git commit -m "[bom-error-handling] BomList: distinguish real errors from empty state"
```

---

### Task 7: Manual verification (all 8 scenarios)

**Files:** none (verification only)

**Interfaces:**
- Consumes: the complete result of Tasks 1-6 together — this is why it runs last.

- [ ] **Step 1: Start both dev servers**

Run (backend, `backend/`): `npm run start:dev`
Run (frontend, repo root): `npm run dev`

- [ ] **Step 2: Global handler — query failure**

Stop the backend, navigate to `/bom` (BomList). Expected: red toast "Failed to load data. Please try again." (or the backend's own message if reachable-but-erroring). Restart the backend afterward.

- [ ] **Step 3: Global handler — mutation failure**

On `/bom`, trigger an action that calls `useSaveAssemblyMatch` (assembly matching save) with the backend stopped. Expected: red toast "Action failed. Please try again."

- [ ] **Step 4: Opt-out — no duplicate toast**

Navigate to a `BomDispatchDetail` page for a non-existent dispatch id (e.g. `/bom/dispatch/999999`). Expected: only the existing dedicated "Not found" error screen renders — no toast pops alongside it.

- [ ] **Step 5: BomEditor — qty-change failure**

Open a BOM in the editor, stop the backend, attempt to change a line's quantity. Expected: red toast "Failed to update quantity. Please try again.", no silent failure, no incorrect optimistic UI state left behind.

- [ ] **Step 6: BomEditor — Activate failure**

With the backend stopped, click "Activate" on a draft BOM. Expected: red toast "Failed to activate BOM. Please try again.", and the Activate button returns to its normal (non-loading) state — not stuck.

- [ ] **Step 7: BomEditor — delete-line failure**

With the backend stopped, attempt to delete a BOM line. Expected: red toast "Failed to delete line. Please try again."

- [ ] **Step 8: BomDiffReview — fetch failure**

Navigate to a BOM's diff review page with the backend stopped. Expected: a dedicated red error state renders in the diff content area (not a blank "nothing to show" page) + a toast.

- [ ] **Step 9: BomList — error vs. empty distinction**

With the backend running: navigate to a project with zero BOM dispatches → confirm "No BOM dispatches yet" + red "Upload First BOM" button (unchanged from today). Then stop the backend and reload `/bom` on any project → confirm the message now reads "Unable to load BOM dispatches" with an outlined "Retry" button (not the upload CTA).

- [ ] **Step 10: Full regression pass**

With the backend running normally again, exercise the happy path on all 4 pages (list loads, editor loads and edits, diff review loads, dispatch detail loads) to confirm nothing in this pass broke the working case.
