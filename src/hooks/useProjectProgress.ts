import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getProgressOverview, getProgressZoneRows, getProgressBimMatch, getProgressProjectRows, getProgressProjectBimMatch,
  updateAssemblyProgress, bulkUpdateAssemblyProgress,
} from '../api/projectProgress'
import type { UpdateAssemblyProgressPayload } from '../api/projectProgress'

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
    mutationFn: ({ assemblyIds, payload }: { assemblyIds: number[]; payload: UpdateAssemblyProgressPayload }) =>
      bulkUpdateAssemblyProgress(projectCode!, assemblyIds, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-progress', 'zone', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'overview', projectCode] })
      qc.invalidateQueries({ queryKey: ['project-progress', 'project-rows', projectCode] })
    },
    meta: { showGlobalErrorToast: true },
  })
}
