import { BadRequestException } from '@nestjs/common'

type Row = unknown[]

// Exact column order returned by the Cutting Plan API (bdt-cutting-plan-service)
// for each table in `data.*` — verified empirically against the live service,
// not just read from its source. The first 7 columns (file_id..revision) are
// project metadata already stored once on cutting_plan_upload — dropped here,
// not duplicated onto every child row.
const NESTING_COLS = [
  'file_id', 'project_code', 'project_name', 'tag', 'description', 'version', 'revision',
  'nc_file', 'need_date', 'nesting_length_mm', 'nesting_width_mm', 'changer', 'gen_date', 'gen_time', 'technology',
  'cuttingplan_number',
  'article_number', 'count', 'plate_number', 'charge', 'quality', 'thick_mm', 'width_mm', 'length_mm', 'area_m2', 'weight_kg', 'nesting_percent',
  'path_type', 'time_min', 'quantity', 'start_time_min', 'total_time_min',
] as const

const ORDER_PART_COLS = [
  'file_id', 'project_code', 'project_name', 'tag', 'description', 'version', 'revision',
  'tag_part', 'order_number', 'item', 'nested', 'ordered', 'due_date', 'drawing_part_no_version_no', 'length_mm', 'width_mm', 'weight_kg',
  'cuttingplan_number',
] as const

const PLATE_USAGE_COLS = [
  'file_id', 'project_code', 'project_name', 'tag', 'description', 'version', 'revision',
  'order_number', 'net_kg', 'gross_kg',
  'cuttingplan_number',
] as const

const REMNANT_COLS = [
  'file_id', 'project_code', 'project_name', 'tag', 'description', 'version', 'revision',
  'plate_number', 'length_mm', 'width_mm', 'area_m2', 'weight_kg', 'count', 'ref_plate', 'ref_plate_seq',
  'cuttingplan_number',
] as const

function assertLength(row: Row, cols: readonly string[], table: string) {
  if (row.length !== cols.length) {
    throw new BadRequestException(
      `Cutting Plan API returned an unexpected column count for "${table}": expected ${cols.length}, got ${row.length}`,
    )
  }
}

function zip(row: Row, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  cols.forEach((col, i) => { out[col] = row[i] })
  return out
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function reqStr(v: unknown): string {
  return String(v ?? '').trim()
}

function int(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function decimal(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export interface MappedNestingRow {
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

export interface MappedOrderPartRow {
  cuttingplan_number: string
  tag_part: number | null
  order_number: string | null
  item: number | null
  nested: number | null
  ordered: number | null
  due_date: string | null
  drawing_part_no_version_no: string | null
  length_mm: number | null
  width_mm: number | null
  weight_kg: number | null
}

export interface MappedPlateUsageRow {
  cuttingplan_number: string
  order_number: string | null
  net_kg: number | null
  gross_kg: number | null
}

export interface MappedRemnantRow {
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

export function mapNestingRow(row: Row): MappedNestingRow {
  assertLength(row, NESTING_COLS, 'nesting')
  const r = zip(row, NESTING_COLS)
  return {
    cuttingplan_number: reqStr(r.cuttingplan_number),
    nc_file: str(r.nc_file),
    need_date: str(r.need_date),
    nesting_length_mm: decimal(r.nesting_length_mm),
    nesting_width_mm: decimal(r.nesting_width_mm),
    changer: str(r.changer),
    gen_date: str(r.gen_date),
    gen_time: str(r.gen_time),
    technology: str(r.technology),
    article_number: str(r.article_number),
    count: int(r.count),
    plate_number: str(r.plate_number),
    charge: str(r.charge),
    quality: str(r.quality),
    thick_mm: decimal(r.thick_mm),
    width_mm: decimal(r.width_mm),
    length_mm: decimal(r.length_mm),
    area_m2: decimal(r.area_m2),
    weight_kg: decimal(r.weight_kg),
    nesting_percent: decimal(r.nesting_percent),
    path_type: str(r.path_type),
    time_min: decimal(r.time_min),
    quantity: int(r.quantity),
    start_time_min: decimal(r.start_time_min),
    total_time_min: decimal(r.total_time_min),
  }
}

export function mapOrderPartRow(row: Row): MappedOrderPartRow {
  assertLength(row, ORDER_PART_COLS, 'order_part')
  const r = zip(row, ORDER_PART_COLS)
  return {
    cuttingplan_number: reqStr(r.cuttingplan_number),
    tag_part: int(r.tag_part),
    order_number: str(r.order_number),
    item: int(r.item),
    nested: int(r.nested),
    ordered: int(r.ordered),
    due_date: str(r.due_date),
    drawing_part_no_version_no: str(r.drawing_part_no_version_no),
    length_mm: decimal(r.length_mm),
    width_mm: decimal(r.width_mm),
    weight_kg: decimal(r.weight_kg),
  }
}

export function mapPlateUsageRow(row: Row): MappedPlateUsageRow {
  assertLength(row, PLATE_USAGE_COLS, 'plate_usage')
  const r = zip(row, PLATE_USAGE_COLS)
  return {
    cuttingplan_number: reqStr(r.cuttingplan_number),
    order_number: str(r.order_number),
    net_kg: decimal(r.net_kg),
    gross_kg: decimal(r.gross_kg),
  }
}

export function mapRemnantRow(row: Row): MappedRemnantRow {
  assertLength(row, REMNANT_COLS, 'remnants')
  const r = zip(row, REMNANT_COLS)
  return {
    cuttingplan_number: reqStr(r.cuttingplan_number),
    plate_number: str(r.plate_number),
    length_mm: decimal(r.length_mm),
    width_mm: decimal(r.width_mm),
    area_m2: decimal(r.area_m2),
    weight_kg: decimal(r.weight_kg),
    count: int(r.count),
    ref_plate: str(r.ref_plate),
    ref_plate_seq: str(r.ref_plate_seq),
  }
}

export const mapNestingRows = (rows: Row[]) => rows.map(mapNestingRow)
export const mapOrderPartRows = (rows: Row[]) => rows.map(mapOrderPartRow)
export const mapPlateUsageRows = (rows: Row[]) => rows.map(mapPlateUsageRow)
export const mapRemnantRows = (rows: Row[]) => rows.map(mapRemnantRow)

// The external parser's sortout_remnants() concats every remnants group
// twice (a copy-paste bug) — every remnant row arrives duplicated exactly.
// Group by full field-equality and keep half of each group (floor, min 1) so
// a genuine single remnant survives even if the bug doesn't hold exactly.
export function dedupRemnants(rows: MappedRemnantRow[]): MappedRemnantRow[] {
  const groups = new Map<string, MappedRemnantRow[]>()
  for (const row of rows) {
    const key = JSON.stringify(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  const result: MappedRemnantRow[] = []
  for (const group of groups.values()) {
    const keep = Math.max(1, Math.floor(group.length / 2))
    result.push(...group.slice(0, keep))
  }
  return result
}

export function buildNestingIdMap(nestingRows: { id: number; cuttingplan_number: string }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of nestingRows) map.set(row.cuttingplan_number, row.id)
  return map
}

export function resolveNestingId(cuttingplanNumber: string, map: Map<string, number>): number | null {
  return map.get(cuttingplanNumber) ?? null
}
