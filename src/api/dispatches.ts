import { apiClient } from './client'
import type { DocType } from '../lib/bom/filenameClassifier'

export type { DocType }
export type DispatchStatus = 'pending' | 'partial' | 'complete'

export interface DispatchSummaryDto {
  id: number
  project_id: number
  zone_id: number
  sub_zone_id: number | null
  status: DispatchStatus
  doc_count: number
  uploaded_at: string
  zone: { id: number; code: string; label: string }
  sub_zone: { id: number; name: string; code: string | null } | null
  uploader: { id: number; name: string }
  assembly_count: number | null
  part_count: number | null
  total_weight_kg: number | null
}

export interface DispatchDetailDto extends DispatchSummaryDto {
  doc_revisions: RevisionHistoryDto[]
}

export interface RevisionHistoryDto {
  id: number
  dispatch_id: number
  doc_type: DocType
  filename: string
  uploaded_at: string
  uploader: { id: number; name: string }
}

export interface DispatchListResponse {
  total: number
  page: number
  limit: number
  pages: number
  items: DispatchSummaryDto[]
  assembly_total?: number
  part_total?: number
}

export const dispatchesApi = {
  list(params?: {
    project_id?: number
    zone_id?: number
    sub_zone_id?: number
    status?: DispatchStatus
    page?: number
    limit?: number
  }): Promise<DispatchListResponse> {
    return apiClient.get('/dispatches', { params }).then(r => r.data)
  },

  get(id: number): Promise<DispatchDetailDto> {
    return apiClient.get(`/dispatches/${id}`).then(r => r.data)
  },

  getHistory(id: number): Promise<RevisionHistoryDto[]> {
    return apiClient.get(`/dispatches/${id}/revisions`).then(r => r.data)
  },

  upload(
    formData: FormData,
    onProgress?: (pct: number) => void,
  ): Promise<DispatchDetailDto> {
    return apiClient
      .post('/bom/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: onProgress
          ? e => { if (e.total) onProgress(Math.round((e.loaded / e.total) * 100)) }
          : undefined,
      })
      .then(r => r.data)
  },
}
