import { apiClient } from './client'
import type { ProjectDTO, ProjectListResponse } from './types'

export const projectsApi = {
  list(params?: { state?: string; q?: string; customer_id?: number; page?: number; limit?: number }): Promise<ProjectListResponse> {
    return apiClient.get('/projects', { params }).then(r => r.data)
  },

  get(project_code: string): Promise<ProjectDTO> {
    return apiClient.get(`/projects/${project_code}`).then(r => r.data)
  },
}
