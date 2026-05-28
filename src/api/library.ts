import { apiClient } from './client'
import type {
  LibraryEntryDTO,
  LibraryEntryListResponse,
  CreateLibraryEntryPayload,
  UpdateLibraryEntryPayload,
} from './types'

export const libraryApi = {
  list(params?: { q?: string; active?: boolean; page?: number; limit?: number }): Promise<LibraryEntryListResponse> {
    return apiClient.get('/product-library', { params }).then(r => r.data)
  },

  get(id: number): Promise<LibraryEntryDTO> {
    return apiClient.get(`/product-library/${id}`).then(r => r.data)
  },

  create(payload: CreateLibraryEntryPayload): Promise<LibraryEntryDTO> {
    return apiClient.post('/product-library', payload).then(r => r.data)
  },

  update(id: number, payload: UpdateLibraryEntryPayload): Promise<LibraryEntryDTO & { warning?: string; std_count?: number; cus_count?: number }> {
    return apiClient.patch(`/product-library/${id}`, payload).then(r => r.data)
  },

  remove(id: number): Promise<LibraryEntryDTO> {
    return apiClient.delete(`/product-library/${id}`).then(r => r.data)
  },
}
