import { BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'

// Dispatch Note (wiki features/mo-part-import-plan §10): one row per
// build-up/assembly mark — Mark No., Set, WeightKg., LENGTH, WIDTH, HIGTH.
// Only the first sheet is read (P3: later sheets can hold stale data from
// other jobs, e.g. Celestica's "FINAL" sheet). Parsed in memory, never stored.

export interface PartMarkInput {
  mark: string
  name?: string | null // "Name" column, e.g. WEB / COLUMN (2026-10-09)
  set_qty: number
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  weight_kg?: number | null
  area_m2?: number | null // "Paint / Area" column, all sets (2026-10-09)
  tw_mm?: number | null
  tf_mm?: number | null
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim())
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n
}
// Spacing in headers varies by export template ("Mark No." vs "MarkNo."),
// so header cells and aliases are compared with all spaces removed.
const squash = (v: string) => v.replace(/\s+/g, '')
const findCol = (header: string[], aliases: string[]) => {
  const want = aliases.map(squash)
  return header.findIndex(h => want.includes(squash(h)))
}

const MARK = ['mark no.', 'mark no', 'mark', 'assembly mark', 'ass mk']
const NAME = ['name', 'description']
const SET = ['set', 'qty', "q'ty", 'quantity']
const WEIGHT = ['weightkg.', 'weightkg', 'weight', 'weight (kg)', 'weight(kg)']
const AREA = ['paint', 'paint area', 'area', 'surface area']
const LENGTH = ['length', 'length (mm)', 'length(mm)']
const WIDTH = ['width', 'width (mm)', 'width(mm)']
const HEIGHT = ['higth', 'height', 'height (mm)', 'height(mm)']

export function parseDispatchNote(buffer: Buffer): { marks: PartMarkInput[]; warnings: string[] } {
  let rows: unknown[][]
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    if (!wb.SheetNames.length) throw new Error('no sheets')
    rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as unknown[][]
  } catch {
    throw new BadRequestException('Dispatch Note: file is not a readable spreadsheet')
  }

  const headerIdx = rows.findIndex(r => findCol((r ?? []).map(norm), MARK) >= 0)
  if (headerIdx < 0) throw new BadRequestException('Dispatch Note: cannot find Mark No. column')
  const header = rows[headerIdx].map(norm)
  const col = {
    mark: findCol(header, MARK), name: findCol(header, NAME), set: findCol(header, SET), weight: findCol(header, WEIGHT),
    area: findCol(header, AREA), length: findCol(header, LENGTH), width: findCol(header, WIDTH), height: findCol(header, HEIGHT),
  }
  if (col.set < 0) throw new BadRequestException('Dispatch Note: cannot find Set column')

  const at = (r: unknown[], i: number) => (i >= 0 ? r[i] : '')
  const marks: PartMarkInput[] = []
  const warnings: string[] = []
  for (const r of rows.slice(headerIdx + 1)) {
    const mark = String(at(r ?? [], col.mark) ?? '').trim()
    // Skip blank rows, the 0/1/2/3 column-index row and the total row (no mark text).
    if (!mark || /^[\d.]+$/.test(mark)) continue
    const set = num(at(r, col.set))
    if (set == null || set <= 0) {
      warnings.push(`${mark}: missing or invalid Set — skipped`)
      continue
    }
    const name = String(at(r, col.name) ?? '').trim()
    const m: PartMarkInput = {
      mark,
      ...(col.name >= 0 ? { name: name || null } : {}),
      set_qty: set,
      length_mm: num(at(r, col.length)),
      width_mm: num(at(r, col.width)),
      height_mm: num(at(r, col.height)),
    }
    const w = num(at(r, col.weight))
    if (w != null) m.weight_kg = w
    const area = num(at(r, col.area))
    if (area != null) m.area_m2 = area
    marks.push(m)
  }
  return { marks, warnings }
}
