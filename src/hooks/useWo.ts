import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptNewVersion,
  getBomVersionStatus,
  getWo,
  getWoBimMatch,
  getWoCancelSiblings,
  getWoEvents,
  getWos,
  getWoSchedule,
  removeWoMark,
  updateWoConsume,
  updateWoParts,
  woCancel,
  woDone,
  woTransition,
  type ConsumeActualInput,
  type PartWithdrawnInput,
  type RemoveMarkInput,
  type WoAction,
} from '../api/wo'

export function useWos(params?: Parameters<typeof getWos>[0]) {
  return useQuery({
    queryKey: ['wo', 'list', params],
    queryFn: () => getWos(params),
    refetchOnMount: 'always', // WO creation happens elsewhere (F-MO P27) — always fetch fresh
  })
}

export function useWo(id: number) {
  return useQuery({
    queryKey: ['wo', 'detail', id],
    queryFn: () => getWo(id),
    enabled: !!id,
    refetchOnMount: 'always',
  })
}

export function useWoEvents(id: number) {
  return useQuery({
    queryKey: ['wo', 'events', id],
    queryFn: () => getWoEvents(id),
    enabled: !!id,
    refetchOnMount: 'always',
  })
}

export function useBomVersionStatus(id: number) {
  return useQuery({
    queryKey: ['wo', 'bom-version', id],
    queryFn: () => getBomVersionStatus(id),
    enabled: !!id,
    refetchOnMount: 'always',
  })
}

// Cancel cascade preview (Task 10, Sprint 20) — only fetch while the cancel
// modal is actually open (`enabled`), not on every WoDetail page load.
export function useWoCancelSiblings(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['wo', 'cancel-siblings', id],
    queryFn: () => getWoCancelSiblings(id),
    enabled: enabled && !!id,
  })
}

export function useWoSchedule(id: number) {
  return useQuery({
    queryKey: ['wo', 'schedule', id],
    queryFn: () => getWoSchedule(id),
    enabled: !!id,
    refetchOnMount: 'always',
  })
}

// Visual tab (Sprint 28, multi-mark selector 2026-09-17) — polls while the
// project's BIM model is still translating, same idiom as useBimStatus, so
// the tab self-heals once translation finishes without a manual reload.
// `bomAssemblyId` selects which mark's match to resolve — part of the query
// key so switching the mark-selector tab refetches instead of reusing a
// cached match for a different mark.
export function useWoBimMatch(id: number, bomAssemblyId?: number) {
  return useQuery({
    queryKey: ['wo', 'bim-match', id, bomAssemblyId ?? null],
    queryFn: () => getWoBimMatch(id, bomAssemblyId),
    enabled: !!id,
    refetchInterval: query => {
      const d = query.state.data
      return d?.status === 'model_not_ready' && d.translation_status !== 'failed' ? 5000 : false
    },
  })
}

// ── Mutations — invalidate detail/list/events/bom-version after a change ──────
function useWoInvalidate(id: number) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['wo', 'detail', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'events', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'bom-version', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'cancel-siblings', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'bim-match', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'list'] })
  }
}

// Simple transitions — release / start / pause / hold / resume. resume is
// dual-purpose server-side (PAUSED→IN_PROGRESS or ON_HOLD→unhold) but the
// same call either way from here.
export function useWoTransition(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (vars: { action: WoAction; body?: Parameters<typeof woTransition>[2] }) =>
      woTransition(id, vars.action, vars.body),
    onSuccess: invalidate,
  })
}

// Done — body.marks[] must cover every non-removed mark on the WO (built by
// the caller from the Marks table's current values).
export function useWoDone(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (body: Parameters<typeof woDone>[1]) => woDone(id, body),
    onSuccess: invalidate,
  })
}

// Cancel (whole WO) — body.mark_reusable[] covers every non-removed mark
// with qty_done > 0.
export function useWoCancel(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (body: Parameters<typeof woCancel>[1]) => woCancel(id, body),
    onSuccess: invalidate,
  })
}

// Remove ONE mark from the WO (multi-mark redesign, NEW) — cascades to
// sibling WOs server-side, so the same invalidation set as any other action.
export function useRemoveWoMark(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (body: RemoveMarkInput) => removeWoMark(id, body),
    onSuccess: invalidate,
  })
}

export function useUpdateWoConsume(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (consume: ConsumeActualInput[]) => updateWoConsume(id, { consume }),
    onSuccess: invalidate,
  })
}

export function useUpdateWoParts(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (parts: PartWithdrawnInput[]) => updateWoParts(id, { parts }),
    onSuccess: invalidate,
  })
}

// Accept a newer BOM version for ONE mark (now scoped per-mark, with an
// optional apply_to_other_wos — the sibling WOs it touches are covered by
// the 'wo','list' + 'wo','detail' invalidation above, same as before).
export function useAcceptNewVersion(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (body: Parameters<typeof acceptNewVersion>[1]) => acceptNewVersion(id, body),
    onSuccess: invalidate,
  })
}
