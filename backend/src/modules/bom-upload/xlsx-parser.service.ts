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

// Column header aliases (lowercase)
const ASSEMBLY_MARK_COLS = ['assembly mark', 'assembly_mark', 'mark', 'assembly', 'asm mark', 'asm_mark']
const PART_MARK_COLS = ['part mark', 'part_mark', 'member mark', 'member_mark', 'part', 'mark']
const NAME_COLS = ['name', 'description', 'desc']
const PROFILE_COLS = ['profile', 'section', 'size', 'shape']
const GRADE_COLS = ['grade', 'steel grade', 'steel_grade', 'material grade', 'mat grade']
const QTY_COLS = ['qty', 'quantity', 'no.', 'no', 'count', 'pieces']
const LENGTH_COLS = ['length', 'length (mm)', 'length_mm', 'len', 'len (mm)', 'len_mm']
const WEIGHT_COLS = ['weight', 'weight (kg)', 'weight_kg', 'wt', 'wt (kg)', 'wt_kg', 'total weight']
const SURFACE_COLS = ['surface area', 'surface_area', 'sa', 'surface area (m2)', 'sa (m2)']

function findCol(header: string[], aliases: string[]): number {
  return header.findIndex(h => aliases.includes(h.toLowerCase().trim()))
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

@Injectable()
export class XlsxParserService {
  parse(buffer: Buffer, docType: BomDocType): ParsedBomFile {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    if (!workbook.SheetNames.length) {
      throw new BadRequestException(`File has no sheets`)
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) {
      throw new BadRequestException(`Sheet has no data rows`)
    }

    const header = (rows[0] as unknown[]).map(h => String(h ?? '').toLowerCase().trim())
    const dataRows = rows.slice(1).filter(r => (r as unknown[]).some(c => c !== '' && c !== null && c !== undefined))

    if (docType === 'ASSEMBLY_LIST') return this.parseAssemblyList(header, dataRows)
    if (docType === 'PART_LIST') return this.parsePartList(header, dataRows)
    return this.parseAssemblyPartList(header, dataRows)
  }

  private parseAssemblyList(header: string[], rows: unknown[][]): ParsedBomFile {
    const markCol = findCol(header, ASSEMBLY_MARK_COLS)
    if (markCol < 0) throw new BadRequestException('Assembly List: cannot find assembly mark column')

    const nameCol = findCol(header, NAME_COLS)
    const qtyCol = findCol(header, QTY_COLS)
    const weightCol = findCol(header, WEIGHT_COLS)
    const surfaceCol = findCol(header, SURFACE_COLS)

    const assemblies: ParsedAssembly[] = []
    for (const row of rows) {
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

  private parsePartList(header: string[], rows: unknown[][]): ParsedBomFile {
    const markCol = findCol(header, PART_MARK_COLS)
    if (markCol < 0) throw new BadRequestException('Part List: cannot find part mark column')

    const descCol = findCol(header, NAME_COLS)
    const profileCol = findCol(header, PROFILE_COLS)
    const gradeCol = findCol(header, GRADE_COLS)
    const qtyCol = findCol(header, QTY_COLS)
    const lengthCol = findCol(header, LENGTH_COLS)
    const weightCol = findCol(header, WEIGHT_COLS)

    const parts: ParsedPart[] = []
    for (const row of rows) {
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

  private parseAssemblyPartList(header: string[], rows: unknown[][]): ParsedBomFile {
    // Try assembly mark col first, then fall back to first column for assembly_mark
    const asmMarkCol = findCol(header, ASSEMBLY_MARK_COLS)
    const partMarkCol = findCol(header, PART_MARK_COLS)

    if (asmMarkCol < 0 || partMarkCol < 0) {
      throw new BadRequestException(
        `Assembly Part List: cannot find assembly_mark (col ${asmMarkCol}) or part_mark (col ${partMarkCol}) columns`,
      )
    }

    const qtyCol = findCol(header, QTY_COLS)
    const assemblyParts: ParsedAssemblyPart[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      const assembly_mark = cellStr(r, asmMarkCol)
      const part_mark = cellStr(r, partMarkCol)
      if (!assembly_mark || !part_mark) continue
      assemblyParts.push({
        assembly_mark,
        part_mark,
        qty: cellNum(r, qtyCol),
        sequence: i + 1,
      })
    }

    return { docType: 'ASSEMBLY_PART_LIST', assemblies: [], parts: [], assemblyParts }
  }
}
