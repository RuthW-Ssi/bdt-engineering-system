import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptNewVersion,
  getBomVersionStatus,
  getScheduleVersions,
  getWo,
  getWoCancelSiblings,
  getWoEvents,
  getWos,
  getWoSchedule,
  updateWo,
  woTransition,
  type WoAction,
} from '../api/wo'

export function useWos(params?: Parameters<typeof getWos>[0]) {
  return useQuery({
    queryKey: ['wo', 'list', params],
    queryFn: () => getWos(params),
    refetchOnMount: 'always', // auto-create on MO confirm happens elsewhere — always fetch fresh (F-MO P27)
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

export function useScheduleVersions() {
  return useQuery({ queryKey: ['schedule', 'versions'], queryFn: getScheduleVersions })
}

// ── Mutations — invalidate detail/list/events/bom-version after a change ──────
function useWoInvalidate(id: number) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['wo', 'detail', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'events', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'bom-version', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'cancel-siblings', id] })
    qc.invalidateQueries({ queryKey: ['wo', 'list'] })
  }
}

export function useWoTransition(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (vars: { action: WoAction; body?: Parameters<typeof woTransition>[2] }) =>
      woTransition(id, vars.action, vars.body),
    onSuccess: invalidate,
  })
}

export function useUpdateWo(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (payload: Parameters<typeof updateWo>[1]) => updateWo(id, payload),
    onSuccess: invalidate,
  })
}

export function useAcceptNewVersion(id: number) {
  const invalidate = useWoInvalidate(id)
  return useMutation({
    mutationFn: (body?: Parameters<typeof acceptNewVersion>[1]) => acceptNewVersion(id, body),
    onSuccess: invalidate,
  })
}
