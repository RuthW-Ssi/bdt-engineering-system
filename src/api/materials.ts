import { apiClient } from './client'
import type { MaterialDTO, MaterialListResponse, CreateMaterialPayload } from './types'

export const materialsApi = {
  list(params?: {
    type?: string
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

  doAction(default_code: string, action: string): Promise<MaterialDTO> {
    return apiClient.post(`/materials/${default_code}/${action}`).then(r => r.data)
  },

  getMessages(default_code: string) {
    return apiClient.get(`/materials/${default_code}/messages`).then(r => r.data)
  },
}
