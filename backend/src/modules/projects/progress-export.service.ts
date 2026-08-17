import { Injectable, NotFoundException } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import { PrismaService } from '../../prisma/prisma.service'
import {
  PROGRESS_EXPORT_COLUMNS, META_SHEET_NAME, sanitizeSheetNames,
  computeColumnGroups, HEADER_ROWS, DATA_START_ROW, GROUP_RESPONSIBLE_LABELS,
  type ProgressComputedKind,
} from './progress-excel'

const HEADER_FILL_ARGB = 'FFD9D9D9' // matches the legacy sheet's header shading
const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

// The legacy sheet's own per-cell border storage is inconsistent (a header
// cell here and there missing a side, likely leftover manual-editing noise
// — its DATA rows are a clean, deliberate thin grid throughout). A uniform
// thin border on every cell renders as the same complete grid without
// chasing that noise.
const THIN_BLACK = { style: 'thin' as const, color: { argb: 'FF000000' } }
const FULL_THIN_BORDER: Partial<ExcelJS.Borders> = { top: THIN_BLACK, left: THIN_BLACK, bottom: THIN_BLACK, right: THIN_BLACK }

// The legacy sheet's own font, verified per header row: title + group
// labels at 16pt, "ผู้รับผิดชอบ" + standalone columns at 12pt, sub-headers
// at 9pt — all "Angsana New" (the Thai serif font it uses throughout).
const HEADER_FONT_NAME = 'Angsana New'
const TITLE_SIZE = 16
const GROUP_LABEL_SIZE = 16
const RESP_SIZE = 12
const SUBHEADER_SIZE = 9
const STANDALONE_HEADER_SIZE = 12

// The legacy sheet's own row heights for rows 1-4 — tall enough (row 4
// especially) for wrapped, multi-line Thai sub-header text to display in
// full rather than getting visually clipped to its last line.
const HEADER_ROW_HEIGHTS = [26.25, 26.25, 20.25, 39.75]

// Payment status has no flat data fill in the legacy sheet — it's colored
// by real Excel conditional formatting, one rule per status value, using
// Excel's own built-in Good/Neutral/Bad palette (verified against the
// legacy file's actual conditionalFormattings, not guessed).
const PAYMENT_STATUS_CF_STYLES: Record<PaymentStatus, { bg: string; text: string }> = {
  'Not Disbursed': { bg: 'FFFFC7CE', text: 'FF9C0006' },
  Disbursed: { bg: 'FFFFEB9C', text: 'FF9C5700' },
  Paid: { bg: 'FFC6EFCE', text: 'FF006100' },
}

function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

import { PAYMENT_STATUSES, STAGE_WEIGHTS, effectiveQty, type FabStage, type PaymentStatus } from './progress-shared'

interface AssemblyRow {
  assembly_mark: string
  name: string | null
  weight_kg: unknown
  qty: unknown
  surface_area_m2: unknown
  length_mm: unknown
  width_mm: unknown
  height_mm: unknown
  progress: Record<string, unknown> | null
  dispatch: { zone_id: number | null }
}

type ComputedMetrics = Record<ProgressComputedKind, number | null>

@Injectable()
export class ProgressExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportProgress(projectCode: string): Promise<{ buffer: ExcelJS.Buffer; filename: string }> {
    const project = await this.prisma.project.findUnique({ where: { project_code: projectCode } })
    if (!project) throw new NotFoundException(`Project ${projectCode} not found`)

    const zones = await this.prisma.project_zone.findMany({
      where: { project_id: project.id, active: true },
      orderBy: [{ erection_sequence: 'asc' }, { id: 'asc' }],
      select: { id: true, label: true },
    })
    const sheetNames = sanitizeSheetNames(zones.map(z => z.label))

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id } },
      orderBy: { assembly_mark: 'asc' },
      select: {
        assembly_mark: true, name: true, weight_kg: true, qty: true,
        surface_area_m2: true, length_mm: true, width_mm: true, height_mm: true,
        progress: true,
        dispatch: { select: { zone_id: true } },
      },
    })

    const workbook = new ExcelJS.Workbook()

    // Hidden meta sheet, added first — round-tripped by import to confirm
    // the uploaded file actually came from THIS project (whole-file reject
    // otherwise, before any zone sheet is even looked at).
    const meta = workbook.addWorksheet(META_SHEET_NAME, { state: 'veryHidden' })
    meta.addRow(['project_code', project.project_code])
    meta.addRow(['exported_at', new Date().toISOString().slice(0, 10)])

    const paymentColIndex = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.field === 'payment_status') + 1 // 1-indexed

    zones.forEach((zone, i) => {
      const sheet = workbook.addWorksheet(sheetNames[i])
      PROGRESS_EXPORT_COLUMNS.forEach((_, colIdx) => { sheet.getColumn(colIdx + 1).width = 12 })

      this.writeHeader(sheet, project.name)

      const rows = assemblies.filter(a => a.dispatch.zone_id === zone.id) as unknown as AssemblyRow[]
      const totalWeightKg = rows.reduce((sum, a) => sum + this.weightOf(a) * effectiveQty(a.qty), 0)

      rows.forEach((a, idx) => {
        const row = sheet.addRow(this.buildDataRow(idx, zone.label, a, totalWeightKg))
        PROGRESS_EXPORT_COLUMNS.forEach((col, colIdx) => {
          const cell = row.getCell(colIdx + 1)
          cell.border = FULL_THIN_BORDER
          if (col.dataFillArgb) cell.fill = solidFill(col.dataFillArgb)
        })
      })

      // Real Excel data-validation dropdown — constrains what a fresh cell
      // offers, doesn't prevent typing over it (progress-import.service.ts
      // treats an out-of-list value as a skipped cell, not a reject).
      if (rows.length) {
        for (let r = DATA_START_ROW; r <= DATA_START_ROW + rows.length - 1; r++) {
          sheet.getCell(r, paymentColIndex).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${PAYMENT_STATUSES.join(',')}"`],
          }
        }
        sheet.getColumn(paymentColIndex).width = 16

        const col = colLetter(paymentColIndex)
        const ref = `${col}${DATA_START_ROW}:${col}${DATA_START_ROW + rows.length - 1}`
        sheet.addConditionalFormatting({
          ref,
          rules: PAYMENT_STATUSES.map((status, priority) => ({
            type: 'cellIs', operator: 'equal', priority: priority + 1,
            formulae: [`"${status}"`],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: PAYMENT_STATUS_CF_STYLES[status].bg } },
              font: { color: { argb: PAYMENT_STATUS_CF_STYLES[status].text } },
            },
          })),
        })
      }
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `${project.project_code}_progress_${new Date().toISOString().slice(0, 10)}.xlsx`
    return { buffer, filename }
  }

  // Rows 1-4: title, group/standalone labels, "ผู้รับผิดชอบ" row (the
  // legacy sheet's own names — this system tracks no such data of its
  // own), sub-headers — mirrors the site team's own legacy tracking sheet
  // layout, fills included.
  private writeHeader(sheet: ExcelJS.Worksheet, projectName: string) {
    const totalCols = PROGRESS_EXPORT_COLUMNS.length
    const groups = computeColumnGroups()
    const groupAtCol = new Map<number, (typeof groups)[number]>()
    groups.forEach(g => { for (let c = g.startCol; c <= g.endCol; c++) groupAtCol.set(c, g) })

    for (let r = 1; r <= HEADER_ROWS; r++) {
      for (let c = 1; c <= totalCols; c++) {
        const cell = sheet.getCell(r, c)
        cell.border = FULL_THIN_BORDER
        cell.fill = solidFill(HEADER_FILL_ARGB)
      }
      // The legacy sheet's own row heights — tall enough that wrapped,
      // multi-line Thai sub-headers (e.g. "น้ำหนักที่เบิกแล้ว") show in
      // full instead of getting clipped to their last line.
      sheet.getRow(r).height = HEADER_ROW_HEIGHTS[r - 1]
    }

    sheet.mergeCells(1, 1, 1, totalCols)
    const titleCell = sheet.getCell(1, 1)
    titleCell.value = `แผนงานผลิตและส่งของโครงการ ${projectName}`
    titleCell.font = { bold: true, size: TITLE_SIZE, name: HEADER_FONT_NAME }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

    for (const group of groups) {
      sheet.mergeCells(2, group.startCol, 2, group.endCol)
      const groupCell = sheet.getCell(2, group.startCol)
      groupCell.value = group.label
      groupCell.font = { bold: true, size: GROUP_LABEL_SIZE, name: HEADER_FONT_NAME }
      groupCell.alignment = { horizontal: 'center' }

      sheet.mergeCells(3, group.startCol, 3, group.endCol)
      const respCell = sheet.getCell(3, group.startCol)
      respCell.value = GROUP_RESPONSIBLE_LABELS[group.group]
      respCell.font = { bold: true, size: RESP_SIZE, name: HEADER_FONT_NAME }
      respCell.alignment = { horizontal: 'center' }
    }

    PROGRESS_EXPORT_COLUMNS.forEach((col, i) => {
      const colNum = i + 1
      const group = groupAtCol.get(colNum)
      if (group) {
        const cell = sheet.getCell(4, colNum)
        cell.value = col.header
        cell.font = { bold: true, size: SUBHEADER_SIZE, name: HEADER_FONT_NAME }
        cell.alignment = { horizontal: 'center', wrapText: true }
        return
      }
      // Every other standalone column's header spans rows 2-4.
      sheet.mergeCells(2, colNum, 4, colNum)
      const cell = sheet.getCell(2, colNum)
      cell.value = col.header
      cell.font = { bold: true, size: STANDALONE_HEADER_SIZE, name: HEADER_FONT_NAME }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })
  }

  private weightOf(a: AssemblyRow): number {
    return a.weight_kg != null ? Number(a.weight_kg) : 0
  }

  private computeMetrics(a: AssemblyRow, totalWeightKg: number): ComputedMetrics {
    const p = a.progress
    const empty: ComputedMetrics = {
      fab_overall_pct: null, zone_fab_contribution_pct: null, load_pct: null,
      erection_weight_kg: null, erection_pcs_pct: null, zone_erection_contribution_pct: null,
    }
    if (!p) return empty // no progress row yet — blank, not zero, matches the sheet's own convention

    const qty = effectiveQty(a.qty)
    const weightKg = this.weightOf(a)
    const rowWeightShare = totalWeightKg > 0 ? (weightKg * qty) / totalWeightKg : 0

    const fabOverallPct = Math.round(
      (Object.keys(STAGE_WEIGHTS) as FabStage[]).reduce((sum, stage) => {
        const pct = Number(p[stage] ?? 0)
        return sum + pct * STAGE_WEIGHTS[stage]
      }, 0) / 100,
    )
    const loadedPcs = Number(p.loaded_pcs ?? 0)
    const erectedPcs = Number(p.erected_pcs ?? 0)
    const loadPct = Math.round((loadedPcs / qty) * 100)
    const erectionPcsPct = Math.round((erectedPcs / qty) * 100)

    return {
      fab_overall_pct: fabOverallPct,
      zone_fab_contribution_pct: Math.round(rowWeightShare * (fabOverallPct / 100) * 10000) / 100,
      load_pct: loadPct,
      erection_weight_kg: Math.round(((weightKg * erectedPcs) / qty) * 100) / 100,
      erection_pcs_pct: erectionPcsPct,
      zone_erection_contribution_pct: Math.round(rowWeightShare * (erectionPcsPct / 100) * 10000) / 100,
    }
  }

  private buildDataRow(idx: number, zoneLabel: string, a: AssemblyRow, totalWeightKg: number): unknown[] {
    const p = a.progress
    const metrics = this.computeMetrics(a, totalWeightKg)
    return PROGRESS_EXPORT_COLUMNS.map(col => {
      switch (col.kind) {
        case 'index': return idx + 1
        case 'zone': return zoneLabel
        case 'mark': return a.assembly_mark
        case 'readonly': return this.readonlyValue(col.field as string, a)
        case 'fab_stage': return p?.[col.field as string] ?? null
        case 'date': {
          const v = p?.[col.field as string] as Date | null | undefined
          return v ? v.toISOString().slice(0, 10) : null
        }
        case 'pcs': return p?.[col.field as string] ?? null
        case 'weight': {
          const v = p?.[col.field as string]
          return v != null ? Number(v) : null
        }
        case 'status': return p?.payment_status ?? null
        case 'computed': return metrics[col.computed as ProgressComputedKind]
        default: return null
      }
    })
  }

  private readonlyValue(field: string, a: AssemblyRow): unknown {
    if (field === 'name') return a.name ?? ''
    const v = (a as unknown as Record<string, unknown>)[field]
    return v != null ? Number(v) : null
  }
}
