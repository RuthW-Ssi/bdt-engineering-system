import { useQuery } from '@tanstack/react-query'
import { projectZonesApi } from '../api/project-zones'

export function useProjectZones(projectId: number | undefined) {
  return useQuery({
    queryKey: ['project-zones', projectId],
    queryFn: () => projectZonesApi.list(projectId!),
    enabled: !!projectId,
  })
}
