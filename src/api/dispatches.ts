import { apiClient } from './client'
import type { DocType } from '../lib/bom/filenameClassifier'

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
  upload_no: number | null
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

interface AssemblyProductDto {
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
  rev: number
  rev_source: RevSource | null
  /** Earlier names from confirmed BOM renames, nearest first (2026-10-27). */
  former_marks?: string[]
}

export interface DispatchDetailDto extends DispatchSummaryDto {
  doc_revisions: RevisionHistoryDto[]
  assemblies?: AssemblyDto[]
  orphan_parts?: AssemblyPartDto[]
  /** Present on `POST /bom/upload` responses only (WO BOM-Version Hold, Sprint 20). */
  hold_summary?: { held_wo_count: number; held_wo_ids: number[] }
}

interface RevisionHistoryDto {
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
  /** Set when this row is a confirmed rename pair — the old mark it was paired from. */
  renamed_from?: string
  /** The `bom_mark_rename` pair id backing `renamed_from`, for undo. */
  rename_id?: number
}

export interface AssemblyDiffItemDto {
  assembly_mark: string
  name: string | null
  qty: number | null
  weight_kg: number | null
  surface_area_m2: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
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

export interface PreviewJunctionsResult {
  unmatchedAssemblyMarks: string[]
  unmatchedPartMarks: string[]
}

// ── Per-mark BOM rev (2026-10-26) ────────────────────────────────
export type RevSource = 'DISPATCH_NOTE' | 'CARRIED' | 'NEW' | 'MANUAL'
export type RevWarning = 'CHANGED_NO_REV_UP' | 'REV_UP_NO_CHANGE' | 'DN_REV_LOWER'
export interface RevChangeDto { field: string; old: string | number | null; new: string | number | null }
export interface PartLineDto { part_mark: string; qty: number | null; description: string | null; profile: string | null; grade: string | null; length_mm: number | null; weight_kg: number | null }
export interface MarkSnapshotDto { mark: string; qty: number | null; name: string | null; length_mm: number | null; width_mm: number | null; height_mm: number | null; weight_kg: number | null; surface_area_m2: number | null; parts: PartLineDto[] }
export interface MarkDiffDto { fields: RevChangeDto[]; parts_added: PartLineDto[]; parts_removed: PartLineDto[]; parts_changed: { part_mark: string; changes: RevChangeDto[] }[] }
export interface RevReviewRowDto {
  mark: string
  kind: 'added' | 'changed' | 'unchanged' | 'removed'
  prev_rev: number | null
  suggested_rev: number | null
  suggested_source: RevSource | null
  dn_rev: number | null
  dn_status: string | null
  in_dn: boolean
  warning: RevWarning | null
  dn_cancelled_in_files: boolean
  rename_hint: string | null
  editable: boolean
  diff: MarkDiffDto | null
}
export interface RevReviewDto { base_dispatch_id: number | null; has_dn: boolean; rows: RevReviewRowDto[]; dn_only_marks: string[]; dn_warnings: string[] }
export interface UploadPreviewDto extends PreviewJunctionsResult { review: RevReviewDto }
export interface RevEdit { mark: string; rev: number }
export interface MarkRevEntryDto {
  rev: number; mark: string; renamed_from: string | null; rev_source: RevSource | null; dn_status: string | null
  upload_no: number | null; dispatch_id: number; uploaded_at: string; uploaded_by: string
  first: boolean; values: MarkSnapshotDto | null; diff: MarkDiffDto | null
}
export interface MarkRevHistoryDto { assembly_id: number; mark: string; current_rev: number; entries: MarkRevEntryDto[] }

// ── BOM Diff 3D model comparison ────────────────────────────────
interface DiffBimModelMatch {
  model_id: number
  version: string
  matches: Record<string, string[]> // assembly_mark -> global_ids[]
}

export interface DispatchDiffBimModelsDto {
  old: DiffBimModelMatch | null
  new: DiffBimModelMatch | null
}

// ── BOM mark/part rename pairing (disappeared ↔ fresh names across versions) ──
export type RenameKind = 'ASSEMBLY' | 'PART'

export interface RenameDataSetDto {
  progress: { field: string; value: string | number }[]
  paint: { paint_type: string; material: string | null; layers: number }[]
}

export interface RenameOptionDto {
  mark: string
  ref_id: number
  score: number | null
  data: RenameDataSetDto | null
}

export interface DisappearedMarkDto {
  mark: string
  ref_id: number
  data: RenameDataSetDto | null
  suggestions: RenameOptionDto[]
}

export interface RenameCandidatesDto {
  dispatch_id: number
  latest: boolean
  assemblies: DisappearedMarkDto[]
  parts: DisappearedMarkDto[]
  new_assemblies: RenameOptionDto[]
  new_parts: RenameOptionDto[]
}

export interface RenamePairInput {
  kind: RenameKind
  from_mark: string
  to_mark: string
  keep?: 'old' | 'new'
}

export interface RenameChangeDto {
  field: string
  old: string | number | null
  new: string | number | null
}

export interface RenamePairDto {
  id: number
  kind: RenameKind
  from_mark: string
  to_mark: string
  keep: 'old' | 'new' | null
  confirmed_by: string
  confirmed_at: string
  used_at: string | null
  undo_blocked: string | null
}

export interface RenameEventDto {
  id: number
  kind: RenameKind
  action: 'PAIR' | 'UNDO'
  from_mark: string
  to_mark: string
  keep: 'old' | 'new' | null
  changes: RenameChangeDto[]
  recorded_by: string
  recorded_at: string
}

export interface RenameListDto {
  pairs: RenamePairDto[]
  history: RenameEventDto[]
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

  getMarkRevHistory(assemblyId: number): Promise<MarkRevHistoryDto> {
    return apiClient.get(`/bom/assemblies/${assemblyId}/rev-history`).then(r => r.data)
  },

  getDiff(id: number): Promise<DispatchDiffDto | null> {
    return apiClient
      .get(`/dispatches/${id}/diff`, { validateStatus: s => s === 200 || s === 204 })
      .then(r => (r.status === 204 ? null : r.data))
  },

  getDiffBimModels(id: number, opts?: { oldModelId?: number; newModelId?: number }): Promise<DispatchDiffBimModelsDto | null> {
    return apiClient
      .get(`/dispatches/${id}/diff/bim-models`, {
        params: { old_model_id: opts?.oldModelId, new_model_id: opts?.newModelId },
        validateStatus: s => s === 200 || s === 204,
      })
      .then(r => (r.status === 204 ? null : r.data))
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

  previewUpload(formData: FormData): Promise<UploadPreviewDto> {
    return apiClient
      .post('/bom/upload/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(r => r.data)
  },

  getZoneUploadMode(projectId: number, zoneId: number): Promise<'combined' | 'separate' | null> {
    return apiClient
      .get('/dispatches', { params: { project_id: projectId, zone_id: zoneId, limit: 1 } })
      .then(r => {
        const items: DispatchSummaryDto[] = r.data.items ?? []
        return items.length > 0 ? items[0].upload_mode : null
      })
  },

  getRenameCandidates(id: number): Promise<RenameCandidatesDto> {
    return apiClient.get(`/dispatches/${id}/rename-candidates`).then(r => r.data)
  },
  getRenames(id: number): Promise<RenameListDto> {
    return apiClient.get(`/dispatches/${id}/renames`).then(r => r.data)
  },
  saveRenames(id: number, renames: RenamePairInput[]): Promise<RenameListDto> {
    return apiClient.post(`/dispatches/${id}/renames`, { renames }).then(r => r.data)
  },
  undoRename(id: number, renameId: number): Promise<RenameListDto> {
    return apiClient.delete(`/dispatches/${id}/renames/${renameId}`).then(r => r.data)
  },
}
