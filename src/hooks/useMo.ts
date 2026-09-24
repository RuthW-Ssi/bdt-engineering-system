import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeMoStatus,
  createMo,
  createMoWorkOrder,
  getBomAssembliesByPrefix,
  getMarkPrefixesWithCount,
  getMo,
  getMoAssemblies,
  getMoConsumeSummary,
  getMoHistory,
  getMoParts,
  getMos,
  getRoutingSuggestions,
  getRoutingTemplateDetail,
  previewMoWorkOrder,
  updateMo,
  type CreateMoPayload,
  type CreateWoPayload,
  type MoStatus,
  type PreviewWoPayload,
} from '../api/mo'

export function useMos(params?: Parameters<typeof getMos>[0]) {
  return useQuery({ queryKey: ['mo', 'list', params], queryFn: () => getMos(params) })
}

export function useMo(id: number) {
  return useQuery({ queryKey: ['mo', 'detail', id], queryFn: () => getMo(id), enabled: !!id })
}

export function useMoAssemblies(id: number) {
  return useQuery({ queryKey: ['mo', 'assemblies', id], queryFn: () => getMoAssemblies(id), enabled: !!id })
}

export function useMoHistory(id: number) {
  return useQuery({ queryKey: ['mo', 'history', id], queryFn: () => getMoHistory(id), enabled: !!id })
}

export function useMoParts(id: number) {
  return useQuery({ queryKey: ['mo', 'parts', id], queryFn: () => getMoParts(id), enabled: !!id })
}

export function useMoConsumeSummary(id: number) {
  return useQuery({ queryKey: ['mo', 'consume-summary', id], queryFn: () => getMoConsumeSummary(id), enabled: !!id })
}

export function useCreateMo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateMoPayload) => createMo(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  })
}

export function useUpdateMo(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<CreateMoPayload>) => updateMo(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  })
}

export function useChangeMoStatus(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { to_status: MoStatus; reason: string }) => changeMoStatus(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  })
}

// Multi-mark redesign (2026-09-17) — the only way a WO gets created now.
// Find-or-creates the WO for (this MO, operation_id) and attaches marks;
// invalidates the WO list so MoDetail's Work Orders tab picks it up.
export function useCreateWorkOrder(moId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateWoPayload) => createMoWorkOrder(moId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wo', 'list'] }),
  })
}

// Live preview (2026-09-17) — refetches as the caller's `marks` selection
// changes, before Create is ever pressed (single-page Create Work Order
// form). `enabled` only once at least one mark is picked; the query key
// includes the full selection so toggling a mark or editing its qty
// refetches automatically.
export function usePreviewWorkOrder(moId: number, operationId: number, marks: PreviewWoPayload['marks']) {
  const key = marks.map((m) => `${m.assembly_line_id}:${m.qty}`).sort().join(',')
  return useQuery({
    queryKey: ['mo', 'work-order-preview', moId, operationId, key],
    queryFn: () => previewMoWorkOrder(moId, { operation_id: operationId, marks }),
    enabled: marks.length > 0,
  })
}

// ── Form-support hooks ────────────────────────────────────────────────────────
// refetchOnMount:'always' → after a cancel/create elsewhere returns allocation,
// re-opening the MO form always shows fresh remaining qty (not a stale cache).
export function useMarkPrefixesWithCount(project_id?: number | null, zone_id?: number | null) {
  return useQuery({
    queryKey: ['mo', 'mark-prefixes', project_id ?? null, zone_id ?? null],
    queryFn: () => getMarkPrefixesWithCount({ project_id: project_id ?? undefined, zone_id: zone_id ?? undefined }),
    refetchOnMount: 'always',
  })
}

export function useAssembliesByPrefix(
  mark_prefix_id: string | null,
  pendingOnly = true,
  group_by = 'project,zone,subzone',
) {
  return useQuery({
    queryKey: ['mo', 'assembly-picker', mark_prefix_id, pendingOnly, group_by],
    queryFn: () =>
      getBomAssembliesByPrefix({ mark_prefix_id: mark_prefix_id!, pending_mo: pendingOnly, group_by }),
    enabled: !!mark_prefix_id,
    refetchOnMount: 'always',
  })
}

export function useRoutingSuggestions(mark_prefix_id: string | null) {
  return useQuery({
    queryKey: ['mo', 'routing-suggest', mark_prefix_id],
    queryFn: () => getRoutingSuggestions(mark_prefix_id!),
    enabled: !!mark_prefix_id,
  })
}

export function useRoutingTemplateDetail(id: number | null) {
  return useQuery({
    queryKey: ['routing-template', id],
    queryFn: () => getRoutingTemplateDetail(id!),
    enabled: id != null,
  })
}
