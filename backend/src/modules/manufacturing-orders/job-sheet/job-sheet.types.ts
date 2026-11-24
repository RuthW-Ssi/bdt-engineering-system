// Per-piece job sheet — the plan handed from JobSheetService (main
// thread, owns Prisma) to the PDF builder (worker thread). Plain data only:
// it crosses the worker boundary by structured clone, so no class instances,
// functions or Prisma Decimals in here (Dates are fine).
import type { JobSheetHoleGroup, JobSheetMode } from './job-sheet-format'

export interface JobSheetRoutingOp {
  sequence: number
  operationLabel: string | null // "op_code — name" of the routing op the WO was created from
  workCenterName: string
  woCode: string | null // null = MO routing template op with no WO yet
  woId: number | null
}

export interface JobSheetDrawingRef {
  file_name: string
  rev: number
  uploaded_at: Date
}

export interface JobSheet {
  sheetNo: number // 1-based position in this batch
  // The MO this piece is made under — per sheet, because a zone batch
  // (GET /mo/job-sheets/zone/:zoneId) mixes sheets of several MOs.
  moId: number
  moCode: string
  moRevision: number
  pieceId: string // human-readable id printed under the QR (not a DB key)
  pieceNo: number | null // null in 'part' mode (one sheet for the whole quantity)
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
  // Traceability fields — nullable until heat / plate traceability lands;
  // null prints as a blank hand-fill box.
  heatNo: string | null
  plateId: string | null
  dueDate: Date | null
  holes: JobSheetHoleGroup[]
  holesKnown: boolean // false = no hole data source for this part (≠ "zero holes")
  routing: JobSheetRoutingOp[]
  drawings: JobSheetDrawingRef[]
  qrUrl: string
  source: 'BOM_PART' | 'MO_PART_LINE'
}

// What a zone batch covered: the zone and every MO that contributed sheets.
export interface JobSheetZoneScope {
  id: number
  code: string
  label: string
  projectCode: string | null
  subZoneId: number | null
  moCodes: string[] // MOs that contributed at least one sheet, in print order
  skippedMoCodes: string[] // MOs in the zone with nothing matching the filters
}

export interface JobSheetPlan {
  // Set for a single-MO batch (GET /mo/:id/job-sheets); null for a zone batch.
  mo: { id: number; mo_code: string; revision: number; plan_finish: Date | null } | null
  // Set for a zone batch only (absent = single-MO batch).
  zone?: JobSheetZoneScope
  mode: JobSheetMode
  sheets: JobSheet[]
  generatedAt: Date
}

// JSON shape of GET /mo/:id/job-sheets/preview and
// GET /mo/job-sheets/zone/:zoneId/preview (the plan + batch totals).
export interface JobSheetPreview extends JobSheetPlan {
  totals: { sheets: number; partMarks: number; pieces: number; weight_kg: number; withoutHoleData: number; withoutDrawing: number; withoutRouting: number }
  max_sheets: number
}
