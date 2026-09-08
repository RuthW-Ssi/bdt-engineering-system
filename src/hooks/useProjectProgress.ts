import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getProgressOverview, getProgressZoneRows, getProgressBimMatch, getProgressProjectRows, getProgressProjectBimMatch,
  getProgressPositions, updateAssemblyProgress, bulkUpdateAssemblyProgress, deletePlaceholderAssembly,
  getDeletedPlaceholderAssemblies, restorePlaceholderAssembly,
  getProgressHistory, getProgressHistoryBatch, rollbackProgressBatch,
} from '../api/projectProgress'
import type { UpdateAssemblyProgressPayload, BulkUpdateAssemblyProgressPayload } from '../api/projectProgress'

export function useProgressOverview(projectCode: string | undefined) {
  return useQuery({
    queryKey: ['project-progress', 'overview', projectCode],
    queryFn: () => getProgressOverview(projectCode!),
    enabled: !!projectCode,
  })
}

export function useProgressZoneRows(projectCode: string | undefined, zoneId: number | null) {
  return useQuery({
    queryKey: ['project-progress', 'zone', projectCode, zoneId],
    queryFn: () => getProgressZoneRows(projectCode!, zoneId!),
    enabled: !!projectCode && zoneId != null,
  })
}

// The match map only changes when a BIM model or BOM dispatch is uploaded —
// no need to refetch alongside every progress edit.
export function useProgressBimMatch(projectCode: string | undefined, zoneId: number | null) {
  return useQuery({
    queryKey: ['project-progress', 'bim-match', projectCode, zoneId],
    queryFn: () => getProgressBimMatch(projectCode!, zoneId!),
    enabled: !!projectCode && zoneId != null,
    staleTime: 5 * 60 * 1000,
  })
}

// Project-wide variants — Overview tab's whole-project 3D view + isolate.
export function useProgressProjectRows(projectCode: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['project-progress', 'project-rows', projectCode],
    queryFn: () => getProgressProjectRows(projectCode!),
    enabled: !!projectCode && enabled,
  })
}

export function useProgressProjectBimMatch(projectCode: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['project-progress', 'project-bim-match', projectCode],
    queryFn: () => getProgressProjectBimMatch(projectCode!),
    enabled: !!projectCode && enabled,
    staleTime: 5 * 60 * 1000,
  })
}

// Overview's Zone/Position toggle — only fetched once the user actually
// switches to the Position view, same lazy pattern as the BIM match hooks.
export function useProgressPositions(projectCode: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['project-progress', 'positions', projectCode],
    queryFn: () => getProgressPositions(projectCode!),
    enabled: !!projectCode && enabled,
  })
}

export function useUpdateAssemblyProgress(projectCode: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assemblyId, payload }: { assemblyId: number; payload: UpdateAssemblyProgressPayload }) =>
      updateAssemblyProgress(projectCode!, assemblyId, payload),
    onSuccess: () => {
      // Zone rows + overview + project-wide rows all derive from the same
      // table — refresh all three.
      qc.invalidateQueries({ queryKey: ['project-progress', 'zone', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'overview', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'project-rows', projectCode] })
    },
    meta: { showGlobalErrorToast: true },
  })
}

export function useBulkUpdateAssemblyProgress(projectCode: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assemblyIds, payload }: { assemblyIds: number[]; payload: BulkUpdateAssemblyProgressPayload }) =>
      bulkUpdateAssemblyProgress(projectCode!, assemblyIds, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-progress', 'zone', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'overview', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'project-rows', projectCode] })
    },
    meta: { showGlobalErrorToast: true },
  })
}

export function useDeletePlaceholderAssembly(projectCode: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assemblyId: number) => deletePlaceholderAssembly(projectCode!, assemblyId),
    onSuccess: () => {
      // Same invalidation set as any other progress-affecting write — the
      // deleted assembly disappears from zone rows, and the placeholder
      // zone's own assembly_count (which drives the hide-when-empty tab
      // guard) lives in overview/project-rows too. Also refresh the
      // deleted-assemblies list — this write is exactly what populates it.
      qc.invalidateQueries({ queryKey: ['project-progress', 'zone', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'overview', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'project-rows', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'deleted-assemblies', projectCode] })
      toast.success('Assembly deleted')
    },
    meta: { showGlobalErrorToast: true },
  })
}

export function useDeletedPlaceholderAssemblies(projectCode: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['project-progress', 'deleted-assemblies', projectCode],
    queryFn: () => getDeletedPlaceholderAssemblies(projectCode!),
    // Lazy — only fetched once the user actually expands the "Deleted"
    // section, same pattern as the BIM match / positions hooks above.
    enabled: !!projectCode && enabled,
  })
}

export function useRestorePlaceholderAssembly(projectCode: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assemblyId: number) => restorePlaceholderAssembly(projectCode!, assemblyId),
    onSuccess: () => {
      // Mirror of useDeletePlaceholderAssembly's invalidation set — the
      // restored assembly reappears in zone rows/overview, and disappears
      // from the deleted-assemblies list.
      qc.invalidateQueries({ queryKey: ['project-progress', 'zone', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'overview', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'project-rows', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'deleted-assemblies', projectCode] })
      toast.success('Assembly restored')
    },
    meta: { showGlobalErrorToast: true },
  })
}

export function useProgressHistory(projectCode: string | undefined) {
  return useQuery({
    queryKey: ['project-progress', 'history', projectCode],
    queryFn: () => getProgressHistory(projectCode!),
    enabled: !!projectCode,
  })
}

export function useProgressHistoryBatch(projectCode: string | undefined, batchId: number | null) {
  return useQuery({
    queryKey: ['project-progress', 'history', projectCode, batchId],
    queryFn: () => getProgressHistoryBatch(projectCode!, batchId!),
    enabled: !!projectCode && batchId != null,
  })
}

// No showGlobalErrorToast — a "conflicts" response is a normal (200) result
// the caller inspects and renders as a confirm dialog, not an HTTP error.
export function useRollbackProgressBatch(projectCode: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ batchId, force }: { batchId: number; force: boolean }) => rollbackProgressBatch(projectCode!, batchId, force),
    onSuccess: (result) => {
      if (result.newBatchId == null && result.conflicts.length) return // conflict-only response, nothing changed yet
      qc.invalidateQueries({ queryKey: ['project-progress', 'zone', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'overview', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'project-rows', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'history', projectCode] })
    },
  })
}
