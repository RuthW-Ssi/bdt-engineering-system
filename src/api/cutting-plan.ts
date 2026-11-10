import { apiClient } from './client'
import { uploadViaPresignedUrl } from './file-storage'

interface CuttingPlanRefs {
  create_user: { id: number; name: string; login: string } | null
  // picked at upload (2026-11-06); null on older uploads
  project: { id: number; project_code: string; name: string } | null
  zone: { id: number; code: string; label: string } | null
  sub_zone: { id: number; code: string | null; name: string } | null
}

export interface CuttingPlanListItem extends CuttingPlanRefs {
  id: number
  file_id: string

  lot: string | null
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

// One of a plate's four stored files (2026-11-06)
export interface CuttingPlanFile {
  id: number
  plate_name: string
  kind: 'TXT' | 'XLS' | 'PDF' | 'DXF'
  file_name: string
  size_bytes: number
}

export interface CuttingPlanDetail extends CuttingPlanListItem {
  files: CuttingPlanFile[]
  nestings: CuttingPlanNestingRow[]
  order_parts: CuttingPlanOrderPartRow[]
  plate_usages: CuttingPlanPlateUsageRow[]
  remnants: CuttingPlanRemnantRow[]
}

export interface CuttingPlanReportProblem {
  file: string
  section: string
  problem: string
}

export interface CuttingPlanPreviewResult {
  summary: {
    plateCount: number
    partCount: number
    plateUsageCount: number
    remnantCount: number
  }
  reportProblems: CuttingPlanReportProblem[] // inside the .txt reports; non-empty → cannot save
  mappingError: string | null
  fileProblems: string[] // four files per plate; non-empty → cannot save
  // Plates the system already holds (same NC File). Same report → skipped at save; changed → newer version.
  alreadyInSystem: CuttingPlanPlateInSystem[]
}

export interface CuttingPlanPlateInSystem {
  plate: string
  ncFile: string
  uploadId: number
  sameReport: boolean
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

export interface SaveCuttingPlanPayload {
  project_id: number
  zone_id: number
  sub_zone_id?: number
  lot?: string
  description?: string
  version: string
  revision: string
  staged: { upload_key: string; file_name: string }[]
}

// Staging (same idea as drawings): the server signs every upload key in ONE call (an upload can be
// ~1,000 files; a call per file hit the API's 600/min limit, 2026-11-06), then each file goes
// straight to storage. Only pdf/octet-stream may be signed, so .txt/.xls/.dxf go as octet-stream.
export interface StagingUrl { file_name: string; upload_key: string; url: string; method: 'PUT' | 'POST'; content_type: string }

export async function getStagingUrls(projectId: number, fileNames: string[]): Promise<StagingUrl[]> {
  return (await apiClient.post('/cutting-plan/upload/staging-urls', { project_id: projectId, file_names: fileNames })).data
}

export async function putStagedFile(s: StagingUrl, file: File): Promise<void> {
  const body = file.type === s.content_type ? file : new File([file], file.name, { type: s.content_type })
  await uploadViaPresignedUrl({ url: s.url, method: s.method }, s.upload_key, body)
}

export function saveCuttingPlan(payload: SaveCuttingPlanPayload): Promise<CuttingPlanDetail> {
  return apiClient.post('/cutting-plan/upload', payload).then(r => r.data)
}

export async function downloadCuttingPlanFile(file: CuttingPlanFile): Promise<void> {
  const res = await apiClient.get(`/cutting-plan/files/${file.id}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a'); a.href = url; a.download = file.file_name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Plate viewer data (2D / 3D / cut simulation), parsed by the server from the stored .dxf + .txt.
export type Pt = [number, number]
export interface PlateViewPart { mark: string; n: number; outer: Pt[]; holes: Pt[][] }
export type PlatePathElement = [0 | 1, number[]] // 0 = rapid, 1 = cut; flat x,y list in mm
export interface PlateView {
  plate: string
  sheet: { nesting_id: number; length_mm: number | null; width_mm: number | null; thick_mm: number | null; quality: string | null; weight_kg: number | null; nesting_percent: number | null
    charge: string | null; nc_file: string | null; plate_number: string | null } | null
  machine: { cutFeed: number; rapidFeed: number; pierceMin: number; totalMin: number | null } | null
  parts: PlateViewPart[]
  path: PlatePathElement[]
}

export async function getPlateView(id: number, plate: string): Promise<PlateView> {
  return (await apiClient.get(`/cutting-plan/${id}/plate-view`, { params: { plate } })).data
}

export async function bulkAssignOrderPartProjectCode(
  payload: BulkAssignOrderPartProjectCodePayload,
): Promise<{ updated: number }> {
  return (await apiClient.patch('/cutting-plan/order-parts/project-code', payload)).data
}

export async function deleteCuttingPlan(id: number): Promise<{ deleted: boolean }> {
  return (await apiClient.delete(`/cutting-plan/${id}`)).data
}
