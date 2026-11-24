// Traceability — pure rules (no DB), so they can be unit-tested alone.
// DRAFT: which parts count as "main parts" and what "complete" means are quality rules;
// they need QA sign-off before the numbers are used in a report to a customer.

/** Heat number as stored: trimmed, blanks removed, upper-case ("h 12345a" → "H12345A"). */
export function normalizeHeatNo(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase()
}

/** Mill name as stored: trimmed, single blanks. "" = not recorded. */
export function normalizeMill(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ')
}

/** Join key between a nesting-report mark and bom_part.part_mark — same rule as the BOM matching: TRIM(LOWER()). */
export function markKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase()
}

/** Plate names are compared without blanks and case (the report can wrap a long name: "0P903-Z1-10-1 0"). */
export function squashName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

/**
 * The report's Charge when it names a plate other than the sheet itself, else null.
 * A sheet re-nested from a plate's remnant may keep that plate's Charge; the link is therefore
 * only a hint (inferred, unverified) and never copied on its own.
 */
export function parentPlateName(charge: string | null | undefined, sheetName: string): string | null {
  const c = charge?.trim()
  return c && squashName(c) !== squashName(sheetName) ? c : null
}

/** true = main part, false = accessory, null = not known (no BOM row, or the zone uploads MAIN+ACC combined). */
export type MainFlag = boolean | null

/** A mark can sit in several ACTIVE BOM rows: MAIN wins, then ACC, else unknown. */
export function mainFlagOfSlots(slots: (string | null | undefined)[]): MainFlag {
  if (slots.some(s => s === 'MAIN')) return true
  if (slots.some(s => s === 'ACC')) return false
  return null
}

export interface SheetVersion { id: number; upload_id: number; nc_file: string | null; cuttingplan_number: string }

/**
 * A plate uploaded again with a changed report is a newer version of the same sheet
 * (same NC file). Only the newest upload of each NC file counts; a sheet without an
 * NC file is its own version.
 */
export function latestSheetIds(sheets: SheetVersion[]): Set<number> {
  const newest = new Map<string, SheetVersion>()
  for (const s of sheets) {
    const key = s.nc_file?.trim() ? `nc:${s.nc_file.trim().toLowerCase()}` : `id:${s.id}`
    const held = newest.get(key)
    if (!held || s.upload_id > held.upload_id || (s.upload_id === held.upload_id && s.id > held.id)) newest.set(key, s)
  }
  return new Set([...newest.values()].map(s => s.id))
}

export interface TraceHeat {
  plate_cut_id: number
  heat_lot_id: number
  heat_no: string
  mill: string
  cert_no: string | null
  plate_no: string | null
  plate_seq: number
  cut_date: string | null // YYYY-MM-DD
}

/** One nested part of a project with what is known about its plate / heat. */
export interface TraceRow {
  order_part_id: number
  upload_id: number
  nesting_id: number | null
  sheet: string // cuttingplan_number
  nc_file: string | null
  report_plate_number: string | null
  quality: string | null
  thick_mm: number | null
  part_mark: string
  project_code: string | null
  qty: number
  weight_kg: number // weight of all pieces on this row
  is_main_part: MainFlag
  bom_part_id: number | null
  traced: boolean
  heats: TraceHeat[]
}

/** main = BOM slot MAIN only · main_or_unknown = everything not marked ACC (default, the careful reading) · all = every nested part. */
export type CompletenessScope = 'main' | 'main_or_unknown' | 'all'
export const COMPLETENESS_SCOPES: CompletenessScope[] = ['main', 'main_or_unknown', 'all']

export function inScope(row: Pick<TraceRow, 'is_main_part'>, scope: CompletenessScope): boolean {
  if (scope === 'all') return true
  if (scope === 'main') return row.is_main_part === true
  return row.is_main_part !== false
}

export interface Completeness {
  scope: CompletenessScope
  parts_total: number
  parts_traced: number
  parts_untraced: number
  pct_parts: number | null // null when there is nothing to trace
  qty_total: number
  qty_traced: number
  pct_qty: number | null
  weight_total_kg: number
  weight_traced_kg: number
  pct_weight: number | null
  main_unknown: number // rows in the whole list whose main/accessory class is not known
  sheets_total: number
  sheets_traced: number
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}

export function computeCompleteness(rows: TraceRow[], scope: CompletenessScope): Completeness {
  const scoped = rows.filter(r => inScope(r, scope))
  const traced = scoped.filter(r => r.traced)
  const sum = (list: TraceRow[], f: (r: TraceRow) => number) => list.reduce((a, r) => a + f(r), 0)
  const sheets = new Map<string, boolean>()
  for (const r of scoped) {
    const key = r.nesting_id != null ? `n${r.nesting_id}` : `u${r.upload_id}:${r.sheet}`
    sheets.set(key, (sheets.get(key) ?? true) && r.traced)
  }
  const qtyTotal = sum(scoped, r => r.qty), qtyTraced = sum(traced, r => r.qty)
  const wTotal = sum(scoped, r => r.weight_kg), wTraced = sum(traced, r => r.weight_kg)
  return {
    scope,
    parts_total: scoped.length,
    parts_traced: traced.length,
    parts_untraced: scoped.length - traced.length,
    pct_parts: pct(traced.length, scoped.length),
    qty_total: qtyTotal,
    qty_traced: qtyTraced,
    pct_qty: pct(qtyTraced, qtyTotal),
    weight_total_kg: Math.round(wTotal * 1000) / 1000,
    weight_traced_kg: Math.round(wTraced * 1000) / 1000,
    pct_weight: pct(wTraced, wTotal),
    main_unknown: rows.filter(r => r.is_main_part == null).length,
    sheets_total: sheets.size,
    sheets_traced: [...sheets.values()].filter(Boolean).length,
  }
}

/** One CSV cell: quoted when needed; a leading = + - @ is neutralised so a spreadsheet does not run it as a formula. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return ''
  let s = typeof v === 'boolean' ? (v ? 'Y' : 'N') : String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV text with a UTF-8 BOM (Excel then reads Thai correctly) and CRLF line ends. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [header, ...rows].map(r => r.map(csvCell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export const TRACE_CSV_HEADER = [
  'project_code', 'part_mark', 'main_part', 'sheet', 'nc_file', 'quality', 'thick_mm', 'qty', 'weight_kg',
  'traced', 'heat_no', 'mill', 'cert_no', 'plate_no', 'plate_seq', 'cut_date',
]

/** Forward CSV: every part cut from a heat — the list to check when a heat is in question. */
export const FORWARD_CSV_HEADER = [
  'heat_no', 'mill', 'cert_no', 'sheet', 'nc_file', 'plate_no', 'plate_seq', 'cut_date',
  'project_code', 'part_mark', 'main_part', 'qty', 'weight_kg',
]

/** One line per part × plate; an untraced part gives one line with the heat columns empty. */
export function traceCsvRows(rows: TraceRow[]): (string | number | boolean | null)[][] {
  const out: (string | number | boolean | null)[][] = []
  for (const r of rows) {
    const head = [
      r.project_code, r.part_mark, r.is_main_part == null ? '?' : r.is_main_part, r.sheet, r.nc_file, r.quality, r.thick_mm, r.qty, r.weight_kg, r.traced,
    ]
    if (!r.heats.length) out.push([...head, null, null, null, null, null, null])
    for (const h of r.heats) out.push([...head, h.heat_no, h.mill, h.cert_no, h.plate_no, h.plate_seq, h.cut_date])
  }
  return out
}
