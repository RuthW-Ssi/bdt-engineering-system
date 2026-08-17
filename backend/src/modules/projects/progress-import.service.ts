import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { PrismaService } from '../../prisma/prisma.service'
import { stripContractPrefix } from '../bom-upload/xlsx-parser.service'
import { PROGRESS_EXPORT_COLUMNS, META_SHEET_NAME, sanitizeSheetNames, computeColumnGroups, HEADER_ROWS, DATA_START_ROW } from './progress-excel'
import { clampPct, clampPcs, nonNegDecimal, effectiveQty, PAYMENT_STATUSES, buildProgressCreateDefaults } from './progress-shared'
import { ProgressChangeLogService, type AuditableField, type DiffEntry } from './progress-change-log.service'

const MARK_COL_INDEX = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.kind === 'mark') // 0-indexed

// Structural header checks — {file row, file column} -> expected text.
// Only rows 2 (group/standalone labels) and 4 (sub-headers) carry real
// contract text; row 1 (title), row 3 ("ผู้รับผิดชอบ", always blank in
// this system) and row 5 (fab-stage weight footer, recalculated live) are
// decorative and deliberately NOT strict-validated — rewriting them by hand
// (or Excel/Sheets touching them on save) must not reject the file.
interface HeaderCheck { fileRow: number; col: number; expected: string }
function buildHeaderChecks(): HeaderCheck[] {
  const checks: HeaderCheck[] = []
  const groups = computeColumnGroups()
  const groupAtCol = new Map<number, (typeof groups)[number]>()
  groups.forEach(g => { for (let c = g.startCol; c <= g.endCol; c++) groupAtCol.set(c, g) })

  PROGRESS_EXPORT_COLUMNS.forEach((col, i) => {
    const colNum = i + 1
    const group = groupAtCol.get(colNum)
    if (group) {
      if (colNum === group.startCol) checks.push({ fileRow: 2, col: colNum, expected: group.label })
      checks.push({ fileRow: 4, col: colNum, expected: col.header })
    } else {
      checks.push({ fileRow: 2, col: colNum, expected: col.header })
    }
  })
  return checks
}
const HEADER_CHECKS = buildHeaderChecks()

export interface ProgressImportChange { zone: string; mark: string; field: AuditableField; old: unknown; new: unknown }
export interface ProgressImportSkip { zone: string; mark: string; field: AuditableField; rawValue: unknown; reason: string }
export interface ProgressImportUnmatched { zone: string; mark: string }
export interface ProgressImportResult {
  changes: ProgressImportChange[]
  unmatchedMarks: ProgressImportUnmatched[]
  skippedCells: ProgressImportSkip[]
}

interface ParsedRow {
  assemblyId: number
  zone: string
  mark: string
  fields: Partial<Record<AuditableField, unknown>>
  diff: DiffEntry[]
}

@Injectable()
export class ProgressImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changeLog: ProgressChangeLogService,
  ) {}

  async previewImport(projectCode: string, buffer: Buffer): Promise<ProgressImportResult> {
    const { rows, unmatchedMarks, skippedCells } = await this.parseAndValidate(projectCode, buffer)
    return {
      changes: rows.flatMap(r => r.diff.map(d => ({ zone: r.zone, mark: r.mark, field: d.field, old: d.old, new: d.new }))),
      unmatchedMarks,
      skippedCells,
    }
  }

  async confirmImport(projectCode: string, buffer: Buffer, fileName: string, userId: number): Promise<{ batchId: number | null; updated: number }> {
    // Re-parses the SAME uploaded file server-side rather than trusting a
    // client-held preview payload — cheap (small files), and the only way
    // to guarantee what gets written is exactly what was actually reviewed.
    const project = await this.findProjectOrThrow(projectCode)
    const { rows } = await this.parseAndValidate(projectCode, buffer)
    const touched = rows.filter(r => r.diff.length > 0)
    if (!touched.length) return { batchId: null, updated: 0 }

    const batchId = await this.prisma.$transaction(async tx => {
      for (const row of touched) {
        // Cast once here — row.fields is deliberately `unknown`-valued
        // (built dynamically from mixed-type Excel cells); every value in
        // it already passed parseCell's per-kind validation before being
        // set, so handing it to Prisma as `any` is safe, same latitude the
        // "plain-interface DTO" pattern elsewhere in this module already takes.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fields = row.fields as Record<string, any>
        await tx.bom_assembly_progress.upsert({
          where: { assembly_id: row.assemblyId },
          create: { assembly_id: row.assemblyId, ...buildProgressCreateDefaults(fields, userId) },
          update: { ...fields, write_uid: userId, write_date: new Date() },
        })
      }
      const { batchId } = await this.changeLog.logBatch(tx, {
        projectId: project.id,
        source: 'import',
        fileName,
        userId,
        rows: touched.map(r => ({ assemblyId: r.assemblyId, diff: r.diff })),
      })
      return batchId
    })

    return { batchId, updated: touched.length }
  }

  private async findProjectOrThrow(projectCode: string) {
    const project = await this.prisma.project.findUnique({ where: { project_code: projectCode } })
    if (!project) throw new NotFoundException(`Project ${projectCode} not found`)
    return project
  }

  // Shared by preview and confirm — everything up to (but not including)
  // the actual DB write. Throws BadRequestException on ANY structural
  // problem (wrong project, missing/renamed/reordered header column) —
  // whole-file reject, no partial parsing, per spec. Structural validation
  // (steps 1-2) runs to completion across every sheet BEFORE any row is
  // parsed, so a bad sheet #3 rejects the whole file even if sheets #1-2
  // looked fine — never a partial accept.
  private async parseAndValidate(
    projectCode: string,
    buffer: Buffer,
  ): Promise<{ rows: ParsedRow[]; unmatchedMarks: ProgressImportUnmatched[]; skippedCells: ProgressImportSkip[] }> {
    const project = await this.findProjectOrThrow(projectCode)
    const zones = await this.prisma.project_zone.findMany({
      where: { project_id: project.id, active: true },
      select: { id: true, label: true },
    })
    const sheetNames = sanitizeSheetNames(zones.map(z => z.label))
    const zoneBySheetName = new Map(zones.map((z, i) => [sheetNames[i], z]))

    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const metaSheet = workbook.Sheets[META_SHEET_NAME]
    if (!metaSheet) throw new BadRequestException('This file has no _meta sheet — it was not exported from this system.')
    const metaRows = XLSX.utils.sheet_to_json<unknown[]>(metaSheet, { header: 1 })
    const metaProjectCode = metaRows.find(r => r[0] === 'project_code')?.[1]
    if (metaProjectCode !== project.project_code) {
      throw new BadRequestException(`This file was exported from project "${metaProjectCode ?? '?'}", not "${project.project_code}".`)
    }

    // 1. Validate every matched sheet's header BEFORE parsing any data row
    // — a structural problem on the LAST sheet must still reject sheets
    // that looked fine, per the whole-file-reject rule.
    const totalCols = PROGRESS_EXPORT_COLUMNS.length
    const sheetsToParse: { sheetName: string; zone: { id: number; label: string } }[] = []
    for (const [sheetName, zone] of zoneBySheetName) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue // no sheet for this zone in the upload — not an error, just nothing to do
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
      const width = Math.max(0, ...aoa.slice(0, HEADER_ROWS).map(r => (r as unknown[])?.length ?? 0))
      if (width !== totalCols) {
        throw new BadRequestException(
          `Sheet '${sheetName}': expected ${totalCols} columns, found ${width}. Re-export and edit that copy instead of changing the file's structure.`,
        )
      }
      for (const check of HEADER_CHECKS) {
        const rowArr = (aoa[check.fileRow - 1] ?? []) as unknown[]
        const found = rowArr[check.col - 1]
        if (found !== check.expected) {
          throw new BadRequestException(
            `Sheet '${sheetName}', row ${check.fileRow} column ${check.col}: expected '${check.expected}', found '${found ?? ''}'. Re-export and edit that copy instead of changing column names/order.`,
          )
        }
      }
      sheetsToParse.push({ sheetName, zone })
    }

    // 2. Every sheet passed structural validation — now parse data rows.
    const rows: ParsedRow[] = []
    const unmatchedMarks: ProgressImportUnmatched[] = []
    const skippedCells: ProgressImportSkip[] = []

    for (const { sheetName, zone } of sheetsToParse) {
      const sheet = workbook.Sheets[sheetName]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

      // Assemblies currently in this zone, keyed by mark — exact match
      // first, then stripContractPrefix fallback (same idiom already used
      // in project-progress.service.ts's getProjectPositions).
      const assemblies = await this.prisma.bom_assembly.findMany({
        where: { status: 'ACTIVE', dispatch: { project_id: project.id, zone_id: zone.id } },
        select: { id: true, assembly_mark: true, qty: true },
      })
      const byMark = new Map(assemblies.map(a => [a.assembly_mark, a]))

      for (const dataRow of aoa.slice(DATA_START_ROW - 1)) {
        const mark = dataRow[MARK_COL_INDEX] as string | null
        if (!mark) continue // blank row
        const assembly = byMark.get(mark) ?? byMark.get(stripContractPrefix(mark))
        if (!assembly) {
          unmatchedMarks.push({ zone: zone.label, mark })
          continue
        }
        const qty = effectiveQty(assembly.qty)

        const current = await this.prisma.bom_assembly_progress.findUnique({ where: { assembly_id: assembly.id } })
        const fields: Partial<Record<AuditableField, unknown>> = {}
        PROGRESS_EXPORT_COLUMNS.forEach((col, i) => {
          if (!col.field || col.kind === 'readonly') return
          const raw = dataRow[i]
          if (raw === null || raw === undefined || raw === '') return // blank cell = no-op
          const parsed = this.parseCell(col.kind, raw, qty)
          if (parsed.error) {
            skippedCells.push({ zone: zone.label, mark, field: col.field as AuditableField, rawValue: raw, reason: parsed.error })
            return
          }
          fields[col.field as AuditableField] = parsed.value
        })

        const diff = this.changeLog.computeDiff(current, fields)
        rows.push({ assemblyId: assembly.id, zone: zone.label, mark, fields, diff })
      }
    }

    return { rows, unmatchedMarks, skippedCells }
  }

  private parseCell(kind: string, raw: unknown, qty: number): { value?: unknown; error?: string } {
    switch (kind) {
      case 'fab_stage': {
        const n = Number(raw)
        if (Number.isNaN(n)) return { error: 'not a number' }
        return { value: clampPct(n) }
      }
      case 'pcs': {
        const n = Number(raw)
        if (Number.isNaN(n)) return { error: 'not a number' }
        return { value: clampPcs(n, qty) }
      }
      case 'weight': {
        const n = Number(raw)
        if (Number.isNaN(n)) return { error: 'not a number' }
        return { value: nonNegDecimal(n) }
      }
      case 'date': {
        const d = new Date(String(raw))
        if (Number.isNaN(d.getTime())) return { error: 'not a valid date' }
        return { value: d }
      }
      case 'status': {
        const s = String(raw)
        if (!(PAYMENT_STATUSES as readonly string[]).includes(s)) {
          return { error: `must be one of: ${PAYMENT_STATUSES.join(', ')}` }
        }
        return { value: s }
      }
      default:
        return { error: 'unsupported column' }
    }
  }
}
