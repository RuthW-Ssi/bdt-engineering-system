import { Injectable, BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import type { BomDocType } from './filename-classifier'

export interface ParsedAssembly {
  assembly_mark: string
  name?: string
  qty?: number
  weight_kg?: number
  surface_area_m2?: number
}

export interface ParsedPart {
  part_mark: string
  description?: string
  profile?: string
  grade?: string
  qty?: number
  length_mm?: number
  weight_kg?: number
}

export interface ParsedAssemblyPart {
  assembly_mark: string
  part_mark: string
  qty?: number
  sequence?: number
}

export interface ParsedBomFile {
  docType: BomDocType
  assemblies: ParsedAssembly[]
  parts: ParsedPart[]
  assemblyParts: ParsedAssemblyPart[]
}

// Column header aliases (lowercase, exact match after trim)
const ASSEMBLY_MARK_COLS = [
  'assembly mark', 'assembly_mark', 'mark', 'assembly',
  'asm mark', 'asm_mark', 'assmk', 'asm mk', 'ass mark',
]
const PART_MARK_COLS = [
  'part mark', 'part_mark', 'member mark', 'member_mark', 'part', 'mark',
]
const NAME_COLS = ['name', 'description', 'desc']
const PROFILE_COLS = ['profile', 'section', 'size', 'shape']
const GRADE_COLS = ['grade', 'steel grade', 'steel_grade', 'material grade', 'mat grade']
const QTY_COLS = ['qty', 'quantity', 'no.', 'no', 'count', 'pieces', "q'ty"]
const LENGTH_COLS = [
  'length', 'length (mm)', 'length_mm', 'len', 'len (mm)', 'len_mm',
  'length(mm)', 'len(mm)',
]
const WEIGHT_COLS = [
  'weight', 'weight (kg)', 'weight_kg', 'wt', 'wt (kg)', 'wt_kg',
  'total weight', 'weight(kg)/1pcs.', 'weight(kg)/pcs.', 'wt(kg)/1pcs.', 'wt(kg)/pcs.',
]
const SURFACE_COLS = [
  'surface area', 'surface_area', 'sa', 'surface area (m2)', 'sa (m2)',
  'area(m2)/pcs.', 'area/1pcs.',
]

function findCol(header: string[], aliases: string[]): number {
  return header.findIndex(h => aliases.includes(h))
}

// Scan up to maxScan rows to find the first row that contains a known alias.
// Handles Tekla-style reports that have title/separator rows before the real header.
function findHeaderRow(
  rows: unknown[][],
  aliases: string[],
  maxScan = 15,
): { headerIdx: number; header: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const header = (rows[i] as unknown[]).map(h => String(h ?? '').toLowerCase().trim())
    if (findCol(header, aliases) >= 0) return { headerIdx: i, header }
  }
  return null
}

function isSeparatorRow(row: unknown[]): boolean {
  return row.some(c => /^-{3,}/.test(String(c ?? '').trim()))
}

// Strip Tekla contract number prefix: "0X181TH-2CO1" → "TH-2CO1"
function stripContractPrefix(mark: string): string {
  return mark.replace(/^[A-Z0-9]+?(?=[A-Z]{2,}-)/, '').trim()
}

function cellNum(row: unknown[], idx: number): number | undefined {
  if (idx < 0 || row[idx] === undefined || row[idx] === null || row[idx] === '') return undefined
  const n = Number(row[idx])
  return isNaN(n) ? undefined : n
}

function cellStr(row: unknown[], idx: number): string | undefined {
  if (idx < 0 || row[idx] === undefined || row[idx] === null || row[idx] === '') return undefined
  return String(row[idx]).trim() || undefined
}

function filterDataRows(rows: unknown[][]): unknown[][] {
  return rows.filter(r => {
    const row = r as unknown[]
    return !isSeparatorRow(row) && row.some(c => c !== '' && c !== null && c !== undefined)
  })
}

@Injectable()
export class XlsxParserService {
  parse(buffer: Buffer, docType: BomDocType): ParsedBomFile {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    if (!workbook.SheetNames.length) {
      throw new BadRequestException('File has no sheets')
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) {
      throw new BadRequestException('Sheet has no data rows')
    }

    if (docType === 'ASSEMBLY_LIST') return this.parseAssemblyList(rows)
    if (docType === 'PART_LIST') return this.parsePartList(rows)
    return this.parseAssemblyPartList(rows)
  }

  private parseAssemblyList(rows: unknown[][]): ParsedBomFile {
    const found = findHeaderRow(rows, ASSEMBLY_MARK_COLS)
    if (!found) throw new BadRequestException('Assembly List: cannot find assembly mark column')

    const { headerIdx, header } = found
    const markCol = findCol(header, ASSEMBLY_MARK_COLS)
    const nameCol = findCol(header, NAME_COLS)
    const qtyCol = findCol(header, QTY_COLS)
    const weightCol = findCol(header, WEIGHT_COLS)
    const surfaceCol = findCol(header, SURFACE_COLS)

    const dataRows = filterDataRows(rows.slice(headerIdx + 1))
    if (dataRows.length === 0) throw new BadRequestException('Assembly List: sheet has no data rows')

    const assemblies: ParsedAssembly[] = []
    for (const row of dataRows) {
      const r = row as unknown[]
      const assembly_mark = cellStr(r, markCol)
      if (!assembly_mark) continue
      assemblies.push({
        assembly_mark,
        name: cellStr(r, nameCol),
        qty: cellNum(r, qtyCol),
        weight_kg: cellNum(r, weightCol),
        surface_area_m2: cellNum(r, surfaceCol),
      })
    }

    return { docType: 'ASSEMBLY_LIST', assemblies, parts: [], assemblyParts: [] }
  }

  private parsePartList(rows: unknown[][]): ParsedBomFile {
    const found = findHeaderRow(rows, PART_MARK_COLS)
    if (!found) throw new BadRequestException('Part List: cannot find part mark column')

    const { headerIdx, header } = found
    const markCol = findCol(header, PART_MARK_COLS)
    const descCol = findCol(header, NAME_COLS)
    const profileCol = findCol(header, PROFILE_COLS)
    const gradeCol = findCol(header, GRADE_COLS)
    const qtyCol = findCol(header, QTY_COLS)
    const lengthCol = findCol(header, LENGTH_COLS)
    const weightCol = findCol(header, WEIGHT_COLS)

    const dataRows = filterDataRows(rows.slice(headerIdx + 1))
    if (dataRows.length === 0) throw new BadRequestException('Part List: sheet has no data rows')

    const parts: ParsedPart[] = []
    for (const row of dataRows) {
      const r = row as unknown[]
      const part_mark = cellStr(r, markCol)
      if (!part_mark) continue
      parts.push({
        part_mark,
        description: cellStr(r, descCol),
        profile: cellStr(r, profileCol),
        grade: cellStr(r, gradeCol),
        qty: cellNum(r, qtyCol),
        length_mm: cellNum(r, lengthCol),
        weight_kg: cellNum(r, weightCol),
      })
    }

    return { docType: 'PART_LIST', assemblies: [], parts, assemblyParts: [] }
  }

  private parseAssemblyPartList(rows: unknown[][]): ParsedBomFile {
    const allAliases = [...ASSEMBLY_MARK_COLS, 'assemblypart']
    const found = findHeaderRow(rows, allAliases)
    if (!found) throw new BadRequestException('Assembly Part List: cannot find header row')

    const { headerIdx, header } = found

    // Tekla nested format: combined "assemblypart" column, assembly header rows
    // interleaved with part rows, separated by "---" lines
    if (header.some(h => h === 'assemblypart')) {
      return this.parseAssemblyPartListTekla(rows, headerIdx, header)
    }

    // Flat format: separate assembly_mark and part_mark columns
    const asmMarkCol = findCol(header, ASSEMBLY_MARK_COLS)
    const partMarkCol = findCol(header, PART_MARK_COLS)

    if (asmMarkCol < 0 || partMarkCol < 0) {
      throw new BadRequestException('Assembly Part List: cannot find assembly_mark or part_mark columns')
    }

    const qtyCol = findCol(header, QTY_COLS)
    const dataRows = filterDataRows(rows.slice(headerIdx + 1))
    if (dataRows.length === 0) throw new BadRequestException('Assembly Part List: sheet has no data rows')

    const assemblyParts: ParsedAssemblyPart[] = []
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i] as unknown[]
      const assembly_mark = cellStr(r, asmMarkCol)
      const part_mark = cellStr(r, partMarkCol)
      if (!assembly_mark || !part_mark) continue
      assemblyParts.push({ assembly_mark, part_mark, qty: cellNum(r, qtyCol), sequence: i + 1 })
    }

    return { docType: 'ASSEMBLY_PART_LIST', assemblies: [], parts: [], assemblyParts }
  }

  // Tekla Assembly Part List: assembly header rows appear after "---" separators,
  // followed by their part rows until the next separator.
  private parseAssemblyPartListTekla(
    rows: unknown[][],
    headerIdx: number,
    header: string[],
  ): ParsedBomFile {
    const markCol = header.findIndex(h => h === 'assemblypart')
    const qtyCol = findCol(header, QTY_COLS)

    const assemblyParts: ParsedAssemblyPart[] = []
    let currentAssemblyMark: string | null = null
    let lastWasSeparator = true // first data row after preamble is treated as assembly header
    let sequence = 0

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r.some(c => c !== '' && c !== null && c !== undefined)) continue

      if (isSeparatorRow(r)) {
        lastWasSeparator = true
        continue
      }

      const markVal = cellStr(r, markCol)
      if (!markVal) { lastWasSeparator = false; continue }

      if (lastWasSeparator) {
        currentAssemblyMark = stripContractPrefix(markVal)
        lastWasSeparator = false
      } else if (currentAssemblyMark) {
        sequence++
        assemblyParts.push({
          assembly_mark: currentAssemblyMark,
          part_mark: markVal,
          qty: cellNum(r, qtyCol),
          sequence,
        })
      }
    }

    return { docType: 'ASSEMBLY_PART_LIST', assemblies: [], parts: [], assemblyParts }
  }
}
