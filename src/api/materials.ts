import { apiClient } from './client'
import type { MaterialDTO, MaterialListResponse, CreateMaterialPayload } from './types'

export const materialsApi = {
  list(params?: {
    state?: string
    categ_id?: number
    q?: string
    page?: number
    limit?: number
  }): Promise<MaterialListResponse> {
    return apiClient.get('/materials', { params }).then(r => r.data)
  },

  get(default_code: string): Promise<MaterialDTO> {
    return apiClient.get(`/materials/${default_code}`).then(r => r.data)
  },

  create(payload: CreateMaterialPayload): Promise<MaterialDTO & { duplicates: unknown[] }> {
    return apiClient.post('/materials', payload).then(r => r.data)
  },

  update(default_code: string, payload: Partial<CreateMaterialPayload>): Promise<MaterialDTO> {
    return apiClient.patch(`/materials/${default_code}`, payload).then(r => r.data)
  },

  actionSubmit(default_code: string): Promise<MaterialDTO> {
    return apiClient.post(`/materials/${default_code}/action_submit`).then(r => r.data)
  },

  actionCancel(default_code: string): Promise<MaterialDTO> {
    return apiClient.post(`/materials/${default_code}/action_cancel`).then(r => r.data)
  },

  actionAssignRunno(default_code: string): Promise<MaterialDTO> {
    return apiClient.post(`/materials/${default_code}/action_assign_runno`).then(r => r.data)
  },

  getMessages(default_code: string) {
    return apiClient.get(`/materials/${default_code}/messages`).then(r => r.data)
  },
}
