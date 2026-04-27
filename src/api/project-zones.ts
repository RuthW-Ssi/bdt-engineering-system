import { apiClient } from './client'
import type { ProjectZoneDTO } from './types'

export const projectZonesApi = {
  list(projectId: number): Promise<ProjectZoneDTO[]> {
    return apiClient.get(`/projects/${projectId}/zones`).then(r => r.data)
  },
}
