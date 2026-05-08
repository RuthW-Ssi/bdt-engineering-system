import { apiClient } from './client'
import type { ProjectDTO, ProjectListResponse } from './types'

export interface CreateProjectPayload {
  project_code: string
  name: string
  customer_id: number
  start_date?: string
  target_handover?: string
}

export const projectsApi = {
  list(params?: { state?: string; q?: string; customer_id?: number; page?: number; limit?: number }): Promise<ProjectListResponse> {
    return apiClient.get('/projects', { params }).then(r => r.data)
  },

  get(project_code: string): Promise<ProjectDTO> {
    return apiClient.get(`/projects/${project_code}`).then(r => r.data)
  },

  create(payload: CreateProjectPayload): Promise<ProjectDTO> {
    return apiClient.post('/projects', payload).then(r => r.data)
  },
}
