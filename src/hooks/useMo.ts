import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelMo,
  changeMoStatus,
  createMo,
  getBomAssembliesByPrefix,
  getMarkPrefixesWithCount,
  getMo,
  getMoAssemblies,
  getMoHistory,
  getMoParts,
  getMos,
  getRoutingSuggestions,
  getRoutingTemplateDetail,
  updateMo,
  type CreateMoPayload,
  type MoStatus,
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

export function useCancelMo(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => cancelMo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mo'] }),
  })
}

// ── Form-support hooks ────────────────────────────────────────────────────────
// refetchOnMount:'always' → after a cancel/create elsewhere returns allocation,
// re-opening the MO form always shows fresh remaining qty (not a stale cache).
export function useMarkPrefixesWithCount() {
  return useQuery({
    queryKey: ['mo', 'mark-prefixes'],
    queryFn: getMarkPrefixesWithCount,
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
