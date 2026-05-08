import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectZonesApi } from '../api/project-zones'
import type { CreateZonePayload } from '../api/project-zones'

export function useProjectZones(projectId: number | undefined) {
  return useQuery({
    queryKey: ['project-zones', projectId],
    queryFn: () => projectZonesApi.list(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateZone(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateZonePayload) => projectZonesApi.create(projectId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-zones', projectId] }),
  })
}

export function useUpdateZone(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ zoneId, payload }: { zoneId: number; payload: { erection_sequence?: number; label?: string } }) =>
      projectZonesApi.update(projectId, zoneId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-zones', projectId] }),
  })
}
