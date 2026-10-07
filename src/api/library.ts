import { apiClient } from './client'
import type {
  LibraryEntryDTO,
  LibraryEntryListResponse,
  CreateLibraryEntryPayload,
  UpdateLibraryEntryPayload,
  MarkPrefixDTO,
} from './types'

export const libraryApi = {
  list(params?: { q?: string; active?: boolean; page?: number; limit?: number }): Promise<LibraryEntryListResponse> {
    return apiClient.get('/product-library', { params }).then(r => r.data)
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

  checkPrefix(code: string): Promise<{ available: boolean }> {
    return apiClient.get(`/product-library/check-prefix/${encodeURIComponent(code)}`).then(r => r.data)
  },

  markPrefixes(): Promise<MarkPrefixDTO[]> {
    return apiClient.get('/product-library/mark-prefixes').then(r => r.data)
  },

  // The active mark_prefix_master registry. markPrefixes() above only lists
  // prefixes that already have product_library entries, so a prefix with no
  // products (OTH for MO Part, BUH for build-up) never shows there. Routing
  // templates bind to the registry, so the routing pages read this (2026-10-06).
  markPrefixMaster(): Promise<MarkPrefixDTO[]> {
    return apiClient.get('/mark-prefixes', { params: { active: 'true' } }).then(r => r.data)
  },

  hardDelete(id: number): Promise<{ deleted: boolean; code: string; name: string }> {
    return apiClient.delete(`/product-library/${id}/permanent`).then(r => r.data)
  },
}
