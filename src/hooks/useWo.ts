import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptNewVersion,
  getBomVersionStatus,
  getScheduleVersions,
  getWo,
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
  return useMutation({ mutationFn: () => acceptNewVersion(id), onSuccess: invalidate })
}
