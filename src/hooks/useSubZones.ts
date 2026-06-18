import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSubZones, createSubZone, updateSubZone, deleteSubZone } from '../api/sub-zones'

export function useSubZones(zoneId: number | null) {
  return useQuery({
    queryKey: ['sub-zones', zoneId],
    queryFn: () => getSubZones(zoneId!),
    enabled: zoneId != null,
  })
}

export function useCreateSubZone(zoneId: number, projectId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; code?: string; start_date?: string; due_date?: string }) => createSubZone(zoneId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-zones', zoneId] })
      if (projectId) qc.invalidateQueries({ queryKey: ['project-zones', projectId] })
    },
  })
}

export function useUpdateSubZone(zoneId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name?: string; code?: string } }) =>
      updateSubZone(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-zones', zoneId] }),
  })
}

export function useDeleteSubZone(zoneId: number, projectId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteSubZone(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-zones', zoneId] })
      if (projectId) qc.invalidateQueries({ queryKey: ['project-zones', projectId] })
    },
  })
}
