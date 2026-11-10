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

  // Every project, page by page (the API caps a page at 100). Pickers use this; one page of 20
  // hid every project after the 20th newest (2026-11-09).
  async listAll(params?: { state?: string }): Promise<ProjectDTO[]> {
    const items: ProjectDTO[] = []
    for (let page = 1; ; page++) {
      const res = await projectsApi.list({ ...params, page, limit: 100 })
      items.push(...res.items)
      if (res.items.length < 100 || items.length >= res.total) return items
    }
  },

  get(project_code: string): Promise<ProjectDTO> {
    return apiClient.get(`/projects/${project_code}`).then(r => r.data)
  },

  create(payload: CreateProjectPayload): Promise<ProjectDTO> {
    return apiClient.post('/projects', payload).then(r => r.data)
  },

  update(project_code: string, payload: Partial<CreateProjectPayload>): Promise<ProjectDTO> {
    return apiClient.patch(`/projects/${project_code}`, payload).then(r => r.data)
  },
}
