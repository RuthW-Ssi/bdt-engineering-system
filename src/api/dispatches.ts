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
  upload_mode: 'combined' | 'separate'
  revision: number
  doc_count: number
  uploaded_at: string
  zone: { id: number; code: string; label: string }
  sub_zone: { id: number; name: string; code: string | null } | null
  uploader: { id: number; name: string }
  assembly_count: number | null
  part_count: number | null
  total_weight_kg: number | null
}

export interface AssemblyPartDto {
  id: number
  part_mark: string
  description: string | null
  profile: string | null
  grade: string | null
  length_mm: number | null
  part_qty: number
  unit_weight_kg: number | null
  match_status: string | null
}

export interface AssemblyProductDto {
  id: number
  product_code: string
  product_type: string
  name: string
}

export interface AssemblyDto {
  id: number
  assembly_mark: string
  name: string | null
  assembly_qty: number
  total_weight_kg: number | null
  surface_area_m2: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  parts: AssemblyPartDto[]
  match_status: string | null
  product: AssemblyProductDto | null
}

export interface DispatchDetailDto extends DispatchSummaryDto {
  doc_revisions: RevisionHistoryDto[]
  assemblies?: AssemblyDto[]
  orphan_parts?: AssemblyPartDto[]
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

export interface DiffMetricDto {
  prev: number | null
  curr: number | null
  delta: number | null
}

export interface DiffChangesDto {
  added: number
  removed: number
  changed: number
}

export interface DiffAggregateDto {
  weight_kg: DiffMetricDto
  area_m2: DiffMetricDto
  assembly_count: DiffMetricDto
  assembly_changes: DiffChangesDto
  part_total: DiffMetricDto
  part_changes: DiffChangesDto
}

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface DiffRowDto<T> {
  status: DiffStatus
  prev: T | null
  curr: T | null
}

export interface AssemblyDiffItemDto {
  assembly_mark: string
  name: string | null
  qty: number | null
  weight_kg: number | null
  surface_area_m2: number | null
}

export interface PartDiffItemDto {
  part_mark: string
  description: string | null
  profile: string | null
  grade: string | null
  qty: number | null
  length_mm: number | null
  weight_kg: number | null
}

export interface JunctionDiffItem {
  assembly_mark: string
  part_mark: string
  qty: number
}

export interface DispatchDiffDto {
  prev_id: number
  curr_id: number
  warning: string | null
  aggregate: DiffAggregateDto
  assembly_diff: DiffRowDto<AssemblyDiffItemDto>[]
  part_diff: DiffRowDto<PartDiffItemDto>[]
  junction_diff: DiffRowDto<JunctionDiffItem>[]
}

// ── Sprint 8: mapping types ────────────────────────────────────
export type MatchStatus = 'MATCHED_STANDARD' | 'MATCHED_CUSTOM'

export interface MappedRowDto {
  id: number
  assembly_mark?: string
  part_mark?: string
  product_id: number | null
  match_status: MatchStatus | null
  product_code: string | null
  product_name: string | null
}

export interface MappingSummaryDto {
  total_assemblies: number
  total_parts: number
  MATCHED_STANDARD: number
  MATCHED_CUSTOM: number
  UNMATCHED: number
}

export interface DispatchMappingDto {
  dispatch_id: number
  assemblies: MappedRowDto[]
  parts: MappedRowDto[]
  summary: MappingSummaryDto
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

  getDiff(id: number): Promise<DispatchDiffDto | null> {
    return apiClient
      .get(`/dispatches/${id}/diff`, { validateStatus: s => s === 200 || s === 204 })
      .then(r => (r.status === 204 ? null : r.data))
  },

  getMapping(id: number): Promise<DispatchMappingDto> {
    return apiClient.get(`/dispatches/${id}/mapping`).then(r => r.data)
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

  saveAssemblyMatch(
    dispatchId: number,
    assignments: { assembly_id: number; match_status: MatchStatus | null; product_id?: number | null }[],
  ): Promise<void> {
    return apiClient.post(`/dispatches/${dispatchId}/assembly-match`, { assignments }).then(() => void 0)
  },

  getZoneUploadMode(projectId: number, zoneId: number): Promise<'combined' | 'separate' | null> {
    return apiClient
      .get('/dispatches', { params: { project_id: projectId, zone_id: zoneId, limit: 1 } })
      .then(r => {
        const items: DispatchSummaryDto[] = r.data.items ?? []
        return items.length > 0 ? items[0].upload_mode : null
      })
  },

  getLatestRevision(projectId: number, zoneId: number, subZoneId: number | null): Promise<number | null> {
    return apiClient
      .get('/dispatches/latest-revision', { params: { project_id: projectId, zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })
      .then(r => r.data.revision)
  },
}
