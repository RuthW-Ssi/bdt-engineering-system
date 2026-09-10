import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getRouting, createRouting, activateRouting, obsoleteRouting,
  recomputeCycleTime,
  getWorkcenters, getWorkcenter, updateWorkcenter, createWorkcenter,
  deleteRoutingOp, reorderRoutingOps,
} from '../api/routings'

// ── Routing hooks ──────────────────────────────────────────────

export function useRouting(productCode: string | undefined) {
  const qc = useQueryClient()
  const key = ['routing', productCode]

  const query = useQuery({
    queryKey: key,
    queryFn: () => getRouting(productCode!),
    enabled: !!productCode,
    staleTime: 5 * 60 * 1000,
  })

  const activate = useMutation({
    mutationFn: () => activateRouting(productCode!),
    onSuccess: (data) => qc.setQueryData(key, data),
  })

  const obsolete = useMutation({
    mutationFn: () => obsoleteRouting(productCode!),
    onSuccess: (data) => qc.setQueryData(key, data),
  })

  const recompute = useMutation({
    mutationFn: () => recomputeCycleTime(productCode!),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const create = useMutation({
    mutationFn: (body: Parameters<typeof createRouting>[1]) =>
      createRouting(productCode!, body),
    onSuccess: (data) => qc.setQueryData(key, data),
  })

  const deleteOp = useMutation({
    mutationFn: (opId: number) => deleteRoutingOp(productCode!, opId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const reorderOps = useMutation({
    mutationFn: (items: { id: number; sequence: number }[]) =>
      reorderRoutingOps(productCode!, items),
    onSuccess: (data) => qc.setQueryData(key, data),
  })

  const routing = query.data ?? []
  const state = routing.length > 0 ? routing[0].state : null
  const totalTimeMin = routing.reduce((sum, op) => sum + Number(op.time_cycle), 0)

  return {
    routing,
    state,
    totalTimeMin,
    loading: query.isLoading,
    error: query.error as Error | null,
    refresh: () => qc.invalidateQueries({ queryKey: key }),
    activate,
    obsolete,
    recompute,
    create,
    deleteOp,
    reorderOps,
  }
}

// ── Workcenter hooks ───────────────────────────────────────────

export function useWorkcenters(active?: boolean) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['workcenters', active],
    queryFn: () => getWorkcenters(active),
    staleTime: 10 * 60 * 1000,
  })
  const create = useMutation({
    mutationFn: createWorkcenter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workcenters'] }),
  })
  return { ...query, create }
}

export function useWorkcenter(id: number | undefined) {
  const qc = useQueryClient()
  const key = ['workcenters', id]

  const query = useQuery({
    queryKey: key,
    queryFn: () => getWorkcenter(id!),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  })

  const update = useMutation({
    mutationFn: (body: Parameters<typeof updateWorkcenter>[1]) =>
      updateWorkcenter(id!, body),
    onSuccess: (data) => {
      qc.setQueryData(key, data)
      qc.invalidateQueries({ queryKey: ['workcenters'] })
    },
  })

  return { workcenter: query.data ?? null, loading: query.isLoading, update }
}
