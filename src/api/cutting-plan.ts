import { apiClient } from './client'

export interface CuttingPlanRefs {
  create_user: { id: number; name: string; login: string } | null
}

export interface CuttingPlanListItem extends CuttingPlanRefs {
  id: number
  file_id: string
  tag: string
  description: string | null
  version: string
  revision: string
  create_date: string
  _count: { nestings: number; order_parts: number; plate_usages: number; remnants: number }
}

export interface CuttingPlanNestingRow {
  id: number
  cuttingplan_number: string
  nc_file: string | null
  need_date: string | null
  nesting_length_mm: number | null
  nesting_width_mm: number | null
  changer: string | null
  gen_date: string | null
  gen_time: string | null
  technology: string | null
  article_number: string | null
  count: number | null
  plate_number: string | null
  charge: string | null
  quality: string | null
  thick_mm: number | null
  width_mm: number | null
  length_mm: number | null
  area_m2: number | null
  weight_kg: number | null
  nesting_percent: number | null
  path_type: string | null
  time_min: number | null
  quantity: number | null
  start_time_min: number | null
  total_time_min: number | null
}

export interface CuttingPlanOrderPartRow {
  id: number
  nesting_id: number | null
  cuttingplan_number: string
  tag_part: number | null
  order_number: string | null // as-parsed from the API, read-only
  project_code: string | null // user-curated, null until bulk-assigned
  item: number | null
  nested: number | null
  ordered: number | null
  due_date: string | null
  drawing_part_no_version_no: string | null
  length_mm: number | null
  width_mm: number | null
  weight_kg: number | null
}

export interface CuttingPlanPlateUsageRow {
  id: number
  nesting_id: number | null
  cuttingplan_number: string
  order_number: string | null
  net_kg: number | null
  gross_kg: number | null
}

export interface CuttingPlanRemnantRow {
  id: number
  nesting_id: number | null
  cuttingplan_number: string
  plate_number: string | null
  length_mm: number | null
  width_mm: number | null
  area_m2: number | null
  weight_kg: number | null
  count: number | null
  ref_plate: string | null
  ref_plate_seq: string | null
}

export interface CuttingPlanDetail extends CuttingPlanListItem {
  nestings: CuttingPlanNestingRow[]
  order_parts: CuttingPlanOrderPartRow[]
  plate_usages: CuttingPlanPlateUsageRow[]
  remnants: CuttingPlanRemnantRow[]
}

export interface CuttingPlanPreviewWarning {
  filename: string
  plateCountDetected: number
}

export interface CuttingPlanPreviewResult {
  summary: {
    plateCount: number
    partCount: number
    plateUsageCount: number
    remnantCount: number
  }
  warnings: CuttingPlanPreviewWarning[]
  mappingError: string | null
}

export interface BulkAssignOrderPartProjectCodePayload {
  order_part_ids: number[]
  project_code: string
}

export async function getCuttingPlans(params?: {
  search?: string
}): Promise<CuttingPlanListItem[]> {
  return (await apiClient.get('/cutting-plan', { params })).data
}

export async function getCuttingPlan(id: number): Promise<CuttingPlanDetail> {
  return (await apiClient.get(`/cutting-plan/${id}`)).data
}

export function previewCuttingPlan(formData: FormData): Promise<CuttingPlanPreviewResult> {
  return apiClient
    .post('/cutting-plan/upload/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then(r => r.data)
}

export function uploadCuttingPlan(
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<CuttingPlanDetail> {
  return apiClient
    .post('/cutting-plan/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? e => { if (e.total) onProgress(Math.round((e.loaded / e.total) * 100)) }
        : undefined,
    })
    .then(r => r.data)
}

export async function bulkAssignOrderPartProjectCode(
  payload: BulkAssignOrderPartProjectCodePayload,
): Promise<{ updated: number }> {
  return (await apiClient.patch('/cutting-plan/order-parts/project-code', payload)).data
}

export async function deleteCuttingPlan(id: number): Promise<{ deleted: boolean }> {
  return (await apiClient.delete(`/cutting-plan/${id}`)).data
}
