import { isAxiosError } from 'axios'
import { apiClient } from './client'
import type { PrintLang } from './mo'

// Per-piece job sheets ("ใบงานต่อชิ้น") — mirrors
// backend/src/modules/manufacturing-orders/job-sheet/job-sheet.types.ts.

export type JobSheetMode = 'piece' | 'part'

export interface JobSheetParams {
  woIds?: number[]
  zoneId?: number
  subZoneId?: number
  assemblyMarks?: string[]
  partMarks?: string[]
  mode?: JobSheetMode
}

export interface JobSheetRoutingOp {
  sequence: number
  operationLabel: string | null
  workCenterName: string
  woCode: string | null
  woId: number | null
}

export interface JobSheetRow {
  moId: number // per sheet: a zone batch mixes MOs
  moCode: string
  moRevision: number
  sheetNo: number
  pieceId: string
  pieceNo: number | null
  pieceTotal: number
  projectCode: string | null
  projectName: string | null
  zoneLabel: string | null
  subZoneName: string | null
  assemblyMark: string
  assemblyName: string | null
  partMark: string
  description: string | null
  profile: string | null
  grade: string | null
  length_mm: number | null
  width_mm: number | null
  thickness_mm: number | null
  unitWeight_kg: number | null
  qtyPerAssembly: number
  heatNo: string | null // null until heat / plate traceability lands
  plateId: string | null
  dueDate: string | null
  holes: { diameter_mm: number; count: number }[]
  holesKnown: boolean
  routing: JobSheetRoutingOp[]
  drawings: { file_name: string; rev: number; uploaded_at: string }[]
  qrUrl: string
  source: 'BOM_PART' | 'MO_PART_LINE'
}

export interface JobSheetZoneScope {
  id: number
  code: string
  label: string
  projectCode: string | null
  subZoneId: number | null
  moCodes: string[]
  skippedMoCodes: string[]
}

export interface JobSheetPreview {
  mo: { id: number; mo_code: string; revision: number; plan_finish: string | null } | null // null for a zone batch
  zone?: JobSheetZoneScope // zone batch only
  mode: JobSheetMode
  sheets: JobSheetRow[]
  generatedAt: string
  totals: { sheets: number; partMarks: number; pieces: number; weight_kg: number; withoutHoleData: number; withoutDrawing: number; withoutRouting: number }
  max_sheets: number
}

// Same convention as the print packet's wo_ids: an omitted list means "no
// filter", an empty one means "explicitly nothing".
function toQuery(p: JobSheetParams): Record<string, string> {
  return {
    ...(p.woIds ? { wo_ids: p.woIds.join(',') } : {}),
    ...(p.zoneId !== undefined ? { zone_id: String(p.zoneId) } : {}),
    ...(p.subZoneId !== undefined ? { sub_zone_id: String(p.subZoneId) } : {}),
    ...(p.assemblyMarks ? { assembly_marks: p.assemblyMarks.join(',') } : {}),
    ...(p.partMarks ? { part_marks: p.partMarks.join(',') } : {}),
    ...(p.mode ? { mode: p.mode } : {}),
  }
}

export async function getJobSheetPreview(moId: number, params: JobSheetParams = {}): Promise<JobSheetPreview> {
  return (await apiClient.get(`/mo/${moId}/job-sheets/preview`, { params: toQuery(params) })).data
}

// Zone batch: every CONFIRMED / IN_PROGRESS MO with work in the zone.
// wo_ids / zone_id do not apply (the zone is the path parameter).
export type ZoneJobSheetParams = Omit<JobSheetParams, 'woIds' | 'zoneId'>

export async function getZoneJobSheetPreview(zoneId: number, params: ZoneJobSheetParams = {}): Promise<JobSheetPreview> {
  return (await apiClient.get(`/mo/job-sheets/zone/${zoneId}/preview`, { params: toQuery(params) })).data
}

// Fetched as an authenticated blob and opened from a blob: URL (the same
// way as fetchMoPrintPacketBlob) — an error body arrives as a Blob too, so it
// is parsed back to JSON for getErrorMessage.
async function getPdfBlob(url: string, params: Record<string, string>): Promise<Blob> {
  try {
    return (await apiClient.get(url, { responseType: 'blob', params })).data as Blob
  } catch (err) {
    if (isAxiosError(err) && err.response?.data instanceof Blob) {
      const text = await err.response.data.text()
      try {
        err.response.data = JSON.parse(text)
      } catch {
        // not JSON — leave the blob in place, getErrorMessage falls back
      }
    }
    throw err
  }
}

export async function fetchJobSheetBlob(moId: number, params: JobSheetParams = {}, lang?: PrintLang): Promise<Blob> {
  return getPdfBlob(`/mo/${moId}/job-sheets`, { ...toQuery(params), ...(lang ? { lang } : {}) })
}

export async function fetchZoneJobSheetBlob(zoneId: number, params: ZoneJobSheetParams = {}, lang?: PrintLang): Promise<Blob> {
  return getPdfBlob(`/mo/job-sheets/zone/${zoneId}`, { ...toQuery(params), ...(lang ? { lang } : {}) })
}
