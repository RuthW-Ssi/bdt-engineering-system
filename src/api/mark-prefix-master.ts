import { apiClient } from './client'
import type { MarkPrefixDTO } from './types'

export const markPrefixApi = {
  list(params?: { category?: string }): Promise<MarkPrefixDTO[]> {
    return apiClient.get('/mark-prefixes', { params }).then(r => r.data)
  },
}
