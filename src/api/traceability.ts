import { apiClient } from './client'

// Traceability: heat lot ↔ plate ↔ nesting sheet ↔ parts.

export interface HeatLotRef { id: number; heat_no: string; mill: string; cert_no: string | null; grade?: string | null }

export interface HeatLot extends HeatLotRef {
  thick_mm: number | string | null
  supplier: string | null
  received_date: string | null
  note: string | null
  active: boolean
  _count?: { plate_cuts: number; part_traces: number }
}

export interface SheetPlateCut {
  id: number
  plate_seq: number
  plate_no: string | null
  cut_date: string | null
  machine: string | null
  note: string | null
  create_date: string
  heat_lot: HeatLotRef
  parts_traced: number
}

/** A heat assignment of an earlier upload of the same plate (same NC file) — a suggestion only. */
export interface PreviousPlateCut {
  plate_cut_id: number
  upload_id: number | null
  sheet: string
  plate_seq: number
  plate_no: string | null
  heat_lot: HeatLotRef
}

export interface SheetTrace {
  nesting_id: number
  cuttingplan_number: string
  nc_file: string | null
  plates_in_report: number | null
  quality: string | null
  thick_mm: number | string | null
  parts: number
  traced: boolean
  plate_cuts: SheetPlateCut[]
  previous_cuts?: PreviousPlateCut[] // older servers do not send it
  parent_plate?: string | null // the report's Charge when it names another plate (sheet likely cut from its remnant — unverified)
  parent_cuts?: PreviousPlateCut[] // that plate's current heat assignment(s), a suggestion only
}

export interface AssignHeatPayload {
  heat_no: string
  mill?: string
  cert_no?: string
  supplier?: string
  plate_no?: string
  plate_seq?: number
  cut_date?: string
  machine?: string
  note?: string
  reason?: string
}

export interface AssignHeatResult {
  plate_cut_id: number
  nesting_id: number
  heat_lot: HeatLotRef
  plate_seq: number
  replaced: number
  parts_traced: number
  warnings: string[]
}

export type CompletenessScope = 'main' | 'main_or_unknown' | 'all'

export interface Completeness {
  scope: CompletenessScope
  parts_total: number
  parts_traced: number
  parts_untraced: number
  pct_parts: number | null
  qty_total: number
  qty_traced: number
  pct_qty: number | null
  weight_total_kg: number
  weight_traced_kg: number
  pct_weight: number | null
  main_unknown: number
  sheets_total: number
  sheets_traced: number
}

export interface TraceHeat {
  plate_cut_id: number
  heat_lot_id: number
  heat_no: string
  mill: string
  cert_no: string | null
  plate_no: string | null
  plate_seq: number
  cut_date: string | null
}

export interface TraceRow {
  order_part_id: number
  upload_id: number
  nesting_id: number | null
  sheet: string
  nc_file: string | null
  report_plate_number: string | null
  quality: string | null
  thick_mm: number | null
  part_mark: string
  project_code: string | null
  qty: number
  weight_kg: number
  is_main_part: boolean | null
  bom_part_id: number | null
  traced: boolean
  heats: TraceHeat[]
}

export interface ProjectTrace {
  project: { id: number; project_code: string; name: string }
  completeness: Completeness
  rows: TraceRow[]
}

export interface ProjectTraceParams { scope?: CompletenessScope; untraced?: 'true' | 'false'; search?: string }

export interface ForwardTrace {
  heat_no: string
  lots: (HeatLotRef & {
    thick_mm: number | string | null
    supplier: string | null
    parts_total: number
    plates: {
      plate_cut_id: number; nesting_id: number | null; upload_id: number | null; sheet: string; nc_file: string | null
      plate_no: string | null; plate_seq: number; cut_date: string | null
      parts: { part_mark: string; project_code: string | null; qty: number | null; weight_kg: number | string | null; is_main_part: boolean | null }[]
    }[]
  })[]
}

export interface BackwardTrace {
  part_mark: string
  project_code: string | null
  traces: {
    part_mark: string; project_code: string | null; qty: number | null; weight_kg: number | string | null; is_main_part: boolean | null
    heat_lot: HeatLotRef & { supplier: string | null }
    plate: { plate_cut_id: number; nesting_id: number | null; upload_id: number | null; sheet: string; nc_file: string | null; plate_no: string | null; plate_seq: number; cut_date: string | null }
  }[]
}

export async function getHeatLots(search?: string): Promise<HeatLot[]> {
  return (await apiClient.get('/traceability/heat-lots', { params: search ? { search } : undefined })).data
}

/** Create a heat lot, or update the one with the same (heat_no, mill). Empty fields are left as they are. */
export interface UpsertHeatLotPayload {
  heat_no: string; mill?: string; grade?: string; thick_mm?: number; cert_no?: string; supplier?: string; received_date?: string; note?: string
}

export async function upsertHeatLot(payload: UpsertHeatLotPayload): Promise<HeatLot> {
  return (await apiClient.post('/traceability/heat-lots', payload)).data
}

export async function getSheetTraces(uploadId: number): Promise<SheetTrace[]> {
  return (await apiClient.get(`/traceability/uploads/${uploadId}/sheets`)).data
}

export async function assignHeatToSheet(nestingId: number, payload: AssignHeatPayload): Promise<AssignHeatResult> {
  return (await apiClient.post(`/traceability/sheets/${nestingId}/assign`, payload)).data
}

export interface BulkAssignHeatResult {
  assigned: number
  parts_traced: number
  done: AssignHeatResult[]
  failed: { nesting_id: number; message: string }[]
}

export async function assignHeatToSheets(nestingIds: number[], payload: AssignHeatPayload): Promise<BulkAssignHeatResult> {
  return (await apiClient.post('/traceability/sheets/assign-bulk', { ...payload, nesting_ids: nestingIds })).data
}

/** One assignment in a sheet's audit trail (ACTIVE or VOID). Records are never deleted. */
export interface SheetHistoryRecord {
  id: number
  plate_seq: number
  plate_no: string | null
  status: 'ACTIVE' | 'VOID'
  void_reason: string | null
  cut_date: string | null
  machine: string | null
  note: string | null
  heat_lot: HeatLotRef
  parts_traced: number
  assigned_at: string
  assigned_by: string | null
  voided_at: string | null
  voided_by: string | null
}

export interface SheetHistory { nesting_id: number; cuttingplan_number: string; records: SheetHistoryRecord[] }

export async function getSheetHistory(nestingId: number): Promise<SheetHistory> {
  return (await apiClient.get(`/traceability/sheets/${nestingId}/history`)).data
}

export async function voidPlateCut(id: number, reason: string): Promise<{ voided: boolean }> {
  return (await apiClient.patch(`/traceability/plate-cuts/${id}/void`, { reason })).data
}

export async function getProjectTrace(projectId: number, params?: ProjectTraceParams): Promise<ProjectTrace> {
  return (await apiClient.get(`/traceability/projects/${projectId}/parts`, { params })).data
}

export async function getForwardTrace(heatNo: string, mill?: string): Promise<ForwardTrace> {
  return (await apiClient.get('/traceability/forward', { params: { heat_no: heatNo, ...(mill ? { mill } : {}) } })).data
}

export async function getBackwardTrace(partMark: string, projectCode?: string): Promise<BackwardTrace> {
  return (await apiClient.get('/traceability/backward', { params: { part_mark: partMark, ...(projectCode ? { project_code: projectCode } : {}) } })).data
}

/** Every part cut from a heat as CSV — the list to check when a heat is in question. */
export async function downloadForwardTraceCsv(heatNo: string, mill?: string): Promise<void> {
  const res = await apiClient.get('/traceability/forward/export.csv', { params: { heat_no: heatNo, ...(mill ? { mill } : {}) }, responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a'); a.href = url; a.download = `heat-${heatNo.replace(/\s+/g, '').toUpperCase()}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadProjectTraceCsv(projectId: number, projectCode: string, params?: ProjectTraceParams): Promise<void> {
  const res = await apiClient.get(`/traceability/projects/${projectId}/export.csv`, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a'); a.href = url; a.download = `traceability-${projectCode}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
