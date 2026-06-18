import { apiClient } from './client'
import type { ProjectZoneDTO } from './types'

export interface CreateZonePayload {
  code: string
  label: string
  erection_sequence?: number
  target_erection_start?: string
  target_erection_end?: string
}

export const projectZonesApi = {
  list(projectId: number): Promise<ProjectZoneDTO[]> {
    return apiClient.get(`/projects/${projectId}/zones`).then(r => r.data)
  },

  create(projectId: number, payload: CreateZonePayload): Promise<ProjectZoneDTO> {
    return apiClient.post(`/projects/${projectId}/zones`, payload).then(r => r.data)
  },

  update(projectId: number, zoneId: number, payload: Partial<CreateZonePayload>): Promise<ProjectZoneDTO> {
    return apiClient.patch(`/projects/${projectId}/zones/${zoneId}`, payload).then(r => r.data)
  },
}
