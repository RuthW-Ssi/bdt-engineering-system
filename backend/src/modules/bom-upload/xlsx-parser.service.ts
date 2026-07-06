import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import * as XLSX from 'xlsx'
import type { BomDocType } from './filename-classifier'

export interface ParsedAssembly {
  assembly_mark: string
  name?: string
  qty?: number
  weight_kg?: number
  surface_area_m2?: number
  length_mm?: number
  width_mm?: number
  height_mm?: number
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
const QTY_COLS = ['qty', 'quantity', "q'ty", 'count', 'pieces', 'no.', 'no']
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
  'area(m2)/pcs.', 'area/1pcs.', 'area',
]
const ASM_LENGTH_COLS = ['length', 'length (mm)', 'length_mm', 'len', 'len (mm)', 'len_mm']
const ASM_WIDTH_COLS  = ['width', 'width (mm)', 'width_mm', 'w', 'wid']
const ASM_HEIGHT_COLS = ['height', 'height (mm)', 'height_mm', 'higth', 'high', 'h', 'hgt']

// Iterate aliases in priority order so more specific names win over generic ones
// (e.g. "q'ty" beats "no." when both appear in the same header)
function findCol(header: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = header.indexOf(alias)
    if (idx >= 0) return idx
  }
  return -1
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

// Extract Tekla contract number from preamble rows before the data header.
// Different Tekla export templates spell this two ways — the typo'd
// "ContactNo.00X220-2Date:28.04.2026" and the correctly-spelled
// "ContractNo:0X221ContractName:...Date:11.05.2026" — so both are matched.
export function extractContractNo(preambleRows: unknown[][]): string {
  for (const row of preambleRows) {
    for (const cell of row) {
      const s = String(cell ?? '').trim()
      const m = s.match(/Contr?actNo\.?:?\s*([0-9X][0-9X\-]*?)(?=Date|ContractName)/i)
      if (m?.[1]) return m[1].trim()
    }
  }
  return ''
}

// Strip Tekla contract number prefix from a mark.
// Primary: startsWith(contractNo) — handles multi-segment prefixes like "00X220-2".
// Fallback: regex heuristic for simple prefixes like "0X181" when header parse fails.
export function stripContractPrefix(mark: string, contractNo?: string): string {
  if (contractNo && mark.startsWith(contractNo)) {
    return mark.slice(contractNo.length).trim()
  }
  // Fallback: match prefix that may contain hyphens (e.g. "00X220-2", "0X181")
  // stopping before the first run of 2+ uppercase letters followed by "-"
  const stripped = mark.replace(/^[A-Z0-9][A-Z0-9\-]*?(?=[A-Z]{2,}-)/, '').trim()
  return stripped !== mark ? stripped : mark
}

// Strip a contract-number prefix only when confidently detected for this exact
// file (mark actually starts with the extracted contractNo) — unlike
// stripContractPrefix, this has NO regex fallback, so it never touches marks
// from non-Tekla or already-clean sources. Used for Assembly List / Part List /
// flat Assembly Part List, where marks are normally clean and a heuristic guess
// risks mangling a legitimate mark (e.g. "WH-CO-001" → "CO-001"). Applying this
// keeps these three parsers symmetric with parseAssemblyPartListTekla so the
// same physical mark resolves to the same string everywhere it's read — a
// mismatch here is what silently drops bom_assembly_part junctions at upload
// time (see BomUploadService.upload's assemblyIdByMark/partIdByMark lookup).
export function stripKnownContractPrefix(mark: string, contractNo?: string): string {
  if (contractNo && mark.startsWith(contractNo)) {
    return mark.slice(contractNo.length).trim()
  }
  return mark
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
  private readonly logger = new Logger(XlsxParserService.name)

  // Read just enough of a file to extract its Tekla contract number, without
  // committing to a docType. Used to derive one contractNo per MAIN/ACC/combined
  // group from that group's Assembly List file, since sibling Assembly Part
  // List / Part List files from the same export often omit this preamble
  // entirely (or spell it differently) — see BomUploadService.parseAllFiles.
  peekContractNo(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    if (!workbook.SheetNames.length) return ''
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
    return extractContractNo(rows.slice(0, 15))
  }

  parse(buffer: Buffer, docType: BomDocType, contractNoOverride?: string): ParsedBomFile {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    if (!workbook.SheetNames.length) {
      throw new BadRequestException('File has no sheets')
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) {
      throw new BadRequestException('Sheet has no data rows')
    }

    if (docType === 'ASSEMBLY_LIST' || docType === 'MAIN_ASSEMBLY_LIST' || docType === 'ACC_ASSEMBLY_LIST')
      return this.parseAssemblyList(rows, contractNoOverride)
    if (docType === 'PART_LIST' || docType === 'MAIN_PART_LIST' || docType === 'ACC_PART_LIST')
      return this.parsePartList(rows, contractNoOverride)
    return this.parseAssemblyPartList(rows, contractNoOverride)
  }

  private parseAssemblyList(rows: unknown[][], contractNoOverride?: string): ParsedBomFile {
    const found = findHeaderRow(rows, ASSEMBLY_MARK_COLS)
    if (!found) throw new BadRequestException('Assembly List: cannot find assembly mark column')

    const { headerIdx, header } = found
    const contractNo = contractNoOverride ?? extractContractNo(rows.slice(0, headerIdx))
    const markCol   = findCol(header, ASSEMBLY_MARK_COLS)
    const nameCol   = findCol(header, NAME_COLS)
    const qtyCol    = findCol(header, QTY_COLS)
    const weightCol = findCol(header, WEIGHT_COLS)
    const surfaceCol  = findCol(header, SURFACE_COLS)
    const lengthCol   = findCol(header, ASM_LENGTH_COLS)
    const widthCol    = findCol(header, ASM_WIDTH_COLS)
    const heightCol   = findCol(header, ASM_HEIGHT_COLS)

    const dataRows = filterDataRows(rows.slice(headerIdx + 1))
    if (dataRows.length === 0) throw new BadRequestException('Assembly List: sheet has no data rows')

    const assemblies: ParsedAssembly[] = []
    for (const row of dataRows) {
      const r = row as unknown[]
      const rawMark = cellStr(r, markCol)
      if (!rawMark) continue
      const assembly_mark = stripKnownContractPrefix(rawMark, contractNo)
      assemblies.push({
        assembly_mark,
        name: cellStr(r, nameCol),
        qty: cellNum(r, qtyCol),
        weight_kg: cellNum(r, weightCol),
        surface_area_m2: cellNum(r, surfaceCol),
        length_mm: cellNum(r, lengthCol),
        width_mm: cellNum(r, widthCol),
        height_mm: cellNum(r, heightCol),
      })
    }

    return { docType: 'ASSEMBLY_LIST', assemblies, parts: [], assemblyParts: [] }
  }

  private parsePartList(rows: unknown[][], contractNoOverride?: string): ParsedBomFile {
    const found = findHeaderRow(rows, PART_MARK_COLS)
    if (!found) throw new BadRequestException('Part List: cannot find part mark column')

    const { headerIdx, header } = found
    const contractNo = contractNoOverride ?? extractContractNo(rows.slice(0, headerIdx))
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
      const rawMark = cellStr(r, markCol)
      if (!rawMark) continue
      const part_mark = stripKnownContractPrefix(rawMark, contractNo)
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

  private parseAssemblyPartList(rows: unknown[][], contractNoOverride?: string): ParsedBomFile {
    const allAliases = [...ASSEMBLY_MARK_COLS, 'assemblypart']
    const found = findHeaderRow(rows, allAliases)
    if (!found) throw new BadRequestException('Assembly Part List: cannot find header row')

    const { headerIdx, header } = found

    // Tekla nested format: combined "assemblypart" column, assembly header rows
    // interleaved with part rows, separated by "---" lines
    if (header.some(h => h === 'assemblypart')) {
      return this.parseAssemblyPartListTekla(rows, headerIdx, header, contractNoOverride)
    }

    // Flat format: separate assembly_mark and part_mark columns
    const contractNo = contractNoOverride ?? extractContractNo(rows.slice(0, headerIdx))
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
      const rawAsmMark = cellStr(r, asmMarkCol)
      const rawPartMark = cellStr(r, partMarkCol)
      if (!rawAsmMark || !rawPartMark) continue
      const assembly_mark = stripKnownContractPrefix(rawAsmMark, contractNo)
      const part_mark = stripKnownContractPrefix(rawPartMark, contractNo)
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
    contractNoOverride?: string,
  ): ParsedBomFile {
    const contractNo = contractNoOverride ?? extractContractNo(rows.slice(0, headerIdx))
    if (!contractNo) {
      this.logger.warn('BOM parse: contract number not found in preamble; falling back to regex prefix strip')
    }
    // Once contractNo is known, trust it exactly: a mark that doesn't start with
    // it (e.g. some Tekla templates only prefix assembly headers, not their own
    // part rows) simply has no prefix to strip — don't let the regex heuristic
    // guess a different one and mangle it (see stripContractPrefix's fallback).
    // Only fall back to that heuristic when the contract number is fully unknown.
    const strip = (mark: string): string =>
      contractNo ? stripKnownContractPrefix(mark, contractNo) : stripContractPrefix(mark, contractNo)

    const markCol = header.findIndex(h => h === 'assemblypart')
    const qtyCol = findCol(header, QTY_COLS)
    const gradeCol = findCol(header, GRADE_COLS)

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

      // A genuine assembly header row never carries a Grade value — only part
      // rows do (confirmed 1:1 against real Tekla exports). If the row right
      // after a separator has one anyway, the real assembly header for this
      // block is missing from the file (e.g. a dropped/edited row) — treat
      // this row as a part of the still-open previous assembly instead of
      // starting a bogus new "assembly" out of what is actually a part mark.
      const looksLikePart = gradeCol >= 0 && !!cellStr(r, gradeCol)

      if (lastWasSeparator && !looksLikePart) {
        currentAssemblyMark = strip(markVal)
      } else if (currentAssemblyMark) {
        sequence++
        assemblyParts.push({
          assembly_mark: currentAssemblyMark,
          part_mark: strip(markVal),
          qty: cellNum(r, qtyCol),
          sequence,
        })
      } else {
        this.logger.warn(`BOM parse: part-shaped row found with no open assembly (mark="${markVal}") — skipped`)
      }
      lastWasSeparator = false
    }

    return { docType: 'ASSEMBLY_PART_LIST', assemblies: [], parts: [], assemblyParts }
  }
}
