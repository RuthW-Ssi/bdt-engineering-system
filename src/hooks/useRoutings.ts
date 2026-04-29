import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getRouting, createRouting, activateRouting, obsoleteRouting,
  recomputeCycleTime, getStdCost, recomputeStdCost,
  getWorkcenters, getWorkcenter, updateWorkcenter,
  getActivityTemplates, previewTemplate, getFormulaParams,
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

// ── Std Cost hooks ─────────────────────────────────────────────

export function useStdCost(productCode: string | undefined) {
  const qc = useQueryClient()
  const key = ['std-cost', productCode]

  const query = useQuery({
    queryKey: key,
    queryFn: () => getStdCost(productCode!),
    enabled: !!productCode,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const recompute = useMutation({
    mutationFn: () => recomputeStdCost(productCode!),
    onSuccess: (data) => qc.setQueryData(key, data),
  })

  return { stdCost: query.data ?? null, loading: query.isLoading, recompute }
}

// ── Workcenter hooks ───────────────────────────────────────────

export function useWorkcenters() {
  return useQuery({
    queryKey: ['workcenters'],
    queryFn: getWorkcenters,
    staleTime: 10 * 60 * 1000,
  })
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

// ── Activity Template hooks ────────────────────────────────────

export function useActivityTemplates(params?: {
  op_code?: string
  workcenter_id?: number
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: ['activity-templates', params],
    queryFn: () => getActivityTemplates(params),
    staleTime: 10 * 60 * 1000,
  })
}

export function useTemplatePreview(id: number | null, attrs: Record<string, number>) {
  return useQuery({
    queryKey: ['template-preview', id, attrs],
    queryFn: () => previewTemplate(id!, attrs),
    enabled: !!id && Object.keys(attrs).length > 0,
    staleTime: 0,
  })
}

// ── Formula Params hook ────────────────────────────────────────

export function useFormulaParams() {
  return useQuery({
    queryKey: ['formula-params'],
    queryFn: getFormulaParams,
    staleTime: 30 * 60 * 1000,
  })
}
