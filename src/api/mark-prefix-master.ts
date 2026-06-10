import { apiClient } from './client'
import type { MarkPrefixDTO } from './types'

export interface CreateMarkPrefixPayload {
  code: string
  label: string
  category: string
  active?: boolean
}

export const markPrefixApi = {
  list(params?: { category?: string }): Promise<MarkPrefixDTO[]> {
    return apiClient.get('/mark-prefixes', { params }).then(r => r.data)
  },

  create(payload: CreateMarkPrefixPayload): Promise<MarkPrefixDTO> {
    return apiClient.post('/mark-prefixes', payload).then(r => r.data)
  },
}
