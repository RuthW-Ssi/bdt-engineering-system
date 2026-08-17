import * as XLSX from 'xlsx'
import { ProgressImportService } from './progress-import.service'
import { ProgressChangeLogService } from './progress-change-log.service'
import { PROGRESS_EXPORT_COLUMNS, META_SHEET_NAME, computeColumnGroups } from './progress-excel'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TOTAL_COLS = PROGRESS_EXPORT_COLUMNS.length
const IDX_OF = (pred: (c: (typeof PROGRESS_EXPORT_COLUMNS)[number]) => boolean) => PROGRESS_EXPORT_COLUMNS.findIndex(pred)
const INDEX_IDX = IDX_OF(c => c.kind === 'index')
const ZONE_IDX = IDX_OF(c => c.kind === 'zone')
const MARK_IDX = IDX_OF(c => c.kind === 'mark')
const NAME_IDX = IDX_OF(c => c.field === 'name')
const QTY_IDX = IDX_OF(c => c.field === 'qty')
const WEIGHT_KG_IDX = IDX_OF(c => c.field === 'weight_kg')
const PAINT_AREA_IDX = IDX_OF(c => c.field === 'surface_area_m2')
const LENGTH_IDX = IDX_OF(c => c.field === 'length_mm')
const WIDTH_IDX = IDX_OF(c => c.field === 'width_mm')
const HEIGHT_IDX = IDX_OF(c => c.field === 'height_mm')
const CUT_IDX = IDX_OF(c => c.field === 'cut')
const PAYMENT_STATUS_IDX = IDX_OF(c => c.field === 'payment_status')

// Builds the same 4-row header block progress-export.service.ts writes
// (derived from the same PROGRESS_EXPORT_COLUMNS + computeColumnGroups()
// contract, not hand-copied) — row 1 title, row 2 group/standalone labels,
// row 3 "ผู้รับผิดชอบ" (blank), row 4 sub-headers.
function buildHeaderRows(): unknown[][] {
  const groups = computeColumnGroups()
  const groupAtCol = new Map<number, (typeof groups)[number]>()
  groups.forEach(g => { for (let c = g.startCol; c <= g.endCol; c++) groupAtCol.set(c, g) })

  const row1 = new Array(TOTAL_COLS).fill(null)
  const row2 = new Array(TOTAL_COLS).fill(null)
  const row3 = new Array(TOTAL_COLS).fill(null)
  const row4 = new Array(TOTAL_COLS).fill(null)
  row1[0] = 'แผนงานผลิตและส่งของโครงการ Test Project Zone-A'

  PROGRESS_EXPORT_COLUMNS.forEach((col, i) => {
    const colNum = i + 1
    const group = groupAtCol.get(colNum)
    if (group) {
      if (colNum === group.startCol) row2[i] = group.label
      row4[i] = col.header
    } else {
      row2[i] = col.header
    }
  })

  return [row1, row2, row3, row4]
}

// Builds a real .xlsx buffer matching the export contract — same tool
// (xlsx) the import service reads with, so these tests exercise the actual
// parsing path, not a mocked stand-in for it.
function buildWorkbookBuffer(projectCode: string, zoneSheets: { name: string; rows: unknown[][] }[]): Buffer {
  const wb = XLSX.utils.book_new()
  const meta = XLSX.utils.aoa_to_sheet([['project_code', projectCode], ['exported_at', '2026-08-17']])
  XLSX.utils.book_append_sheet(wb, meta, META_SHEET_NAME)
  for (const { name, rows } of zoneSheets) {
    const sheet = XLSX.utils.aoa_to_sheet([...buildHeaderRows(), ...rows])
    XLSX.utils.book_append_sheet(wb, sheet, name)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// A full data row matching TC-CO1 at 3% cut, everything else blank
// (including every computed column — import never reads those) — index,
// zone, name, mark are the only other non-null cells besides `cut`. Every
// field is placed via its column's real position (found dynamically),
// never a hardcoded literal index — a prior column-order change silently
// broke a hardcoded-index version of this helper.
function baseRow(mark: string, overrides: Record<number, unknown> = {}): unknown[] {
  const row: unknown[] = new Array(TOTAL_COLS).fill(null)
  row[INDEX_IDX] = 1
  row[ZONE_IDX] = 'Zone-A'
  row[NAME_IDX] = 'COLUMN'
  row[MARK_IDX] = mark
  row[QTY_IDX] = 1
  row[WEIGHT_KG_IDX] = 100
  row[PAINT_AREA_IDX] = 10
  row[LENGTH_IDX] = 1000
  row[WIDTH_IDX] = 300
  row[HEIGHT_IDX] = 8000
  row[CUT_IDX] = 3
  row[PAYMENT_STATUS_IDX] = 'Not Disbursed'
  for (const [i, v] of Object.entries(overrides)) row[Number(i)] = v
  return row
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 1, project_code: '0X220' }) },
    project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, label: 'Zone-A' }]) },
    bom_assembly: {
      findMany: jest.fn().mockResolvedValue([{ id: 80, assembly_mark: 'TC-CO1', qty: 4 }]),
    },
    // Matches baseRow's baked-in "current" values (cut: 3, payment_status:
    // 'Not Disbursed') — this is the DB state a real export of that exact
    // row would have been generated from, so importing baseRow() unchanged
    // diffs to nothing by default. Tests needing a different starting
    // state override this key explicitly.
    bom_assembly_progress: {
      findUnique: jest.fn().mockResolvedValue({ cut: 3, payment_status: 'Not Disbursed' }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    progress_change_batch: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    progress_change_entry: { createMany: jest.fn() },
  }
  const merged: Record<string, unknown> = { ...base, ...overrides }
  const prisma = merged as unknown as any
  prisma.$transaction = jest.fn((fn: unknown) => (typeof fn === 'function' ? (fn as any)(prisma) : Promise.all(fn as any)))
  return prisma
}

function makeService(prisma: any) {
  const changeLog = new ProgressChangeLogService(prisma)
  return new ProgressImportService(prisma, changeLog)
}

describe('ProgressImportService.previewImport', () => {
  it('round-trips its own export unchanged → zero changes, zero unmatched, zero skipped', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-CO1')] }])

    const result = await svc.previewImport('0X220', buffer)
    expect(result).toEqual({ changes: [], unmatchedMarks: [], skippedCells: [] })
  })

  it('reports a diff only for the cell that actually changed', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-CO1', { [CUT_IDX]: 80 })] }]) // cut 3 -> 80

    const result = await svc.previewImport('0X220', buffer)
    expect(result.changes).toEqual([{ zone: 'Zone-A', mark: 'TC-CO1', field: 'cut', old: 3, new: 80 }])
  })

  it('rejects the whole file when project_code in _meta does not match the URL project', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X999', [{ name: 'Zone-A', rows: [baseRow('TC-CO1')] }])

    await expect(svc.previewImport('0X220', buffer)).rejects.toThrow(/exported from project "0X999"/)
  })

  it('rejects the whole file on a renamed sub-header column, naming the sheet + row + column + expected/found text', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const headerRows = buildHeaderRows()
    headerRows[3][CUT_IDX] = 'CUT ' // row 4 (sub-headers) — was 'Cut'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['project_code', '0X220']]), META_SHEET_NAME)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...headerRows, baseRow('TC-CO1')]), 'Zone-A')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await expect(svc.previewImport('0X220', buffer)).rejects.toThrow(
      new RegExp(`row 4 column ${CUT_IDX + 1}: expected 'Cut', found 'CUT '`),
    )
  })

  it('rejects the whole file on a renamed group header, naming the row + column + expected/found text', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const headerRows = buildHeaderRows()
    const fabStartCol = computeColumnGroups().find(g => g.group === 'fabrication')!.startCol
    headerRows[1][fabStartCol - 1] = 'Fab' // row 2 — was 'Fabrication'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['project_code', '0X220']]), META_SHEET_NAME)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...headerRows, baseRow('TC-CO1')]), 'Zone-A')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await expect(svc.previewImport('0X220', buffer)).rejects.toThrow(
      new RegExp(`row 2 column ${fabStartCol}: expected 'Fabrication', found 'Fab'`),
    )
  })

  it('rejects the whole file when a sheet has the wrong column count', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const headerRows = buildHeaderRows().map(r => [...r, null])
    headerRows[3][TOTAL_COLS] = 'Extra Column'
    const dataRow = [...baseRow('TC-CO1'), 'junk']
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['project_code', '0X220']]), META_SHEET_NAME)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...headerRows, dataRow]), 'Zone-A')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await expect(svc.previewImport('0X220', buffer)).rejects.toThrow(
      new RegExp(`expected ${TOTAL_COLS} columns, found ${TOTAL_COLS + 1}`),
    )
  })

  it('rejects when there is no _meta sheet at all', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...buildHeaderRows(), baseRow('TC-CO1')]), 'Zone-A')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await expect(svc.previewImport('0X220', buffer)).rejects.toThrow(/no _meta sheet/)
  })

  it('an unmatched mark is reported, not an error — sheet still processes the rest', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-GHOST')] }])

    const result = await svc.previewImport('0X220', buffer)
    expect(result.unmatchedMarks).toEqual([{ zone: 'Zone-A', mark: 'TC-GHOST' }])
    expect(result.changes).toEqual([])
  })

  it('an invalid payment_status value is a skipped cell, not a whole-file reject', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-CO1', { [PAYMENT_STATUS_IDX]: 'Kinda Paid' })] }])

    const result = await svc.previewImport('0X220', buffer)
    expect(result.skippedCells).toEqual([
      { zone: 'Zone-A', mark: 'TC-CO1', field: 'payment_status', rawValue: 'Kinda Paid', reason: expect.stringContaining('must be one of') },
    ])
    expect(result.changes).toEqual([]) // the invalid cell itself never became a change
  })

  it('a blank editable cell is a no-op, not written as a change even when the field currently has a value', async () => {
    const prisma = makePrisma({
      bom_assembly_progress: { findUnique: jest.fn().mockResolvedValue({ cut: 50 }), upsert: jest.fn() },
    })
    const svc = makeService(prisma)
    // baseRow's cut cell left as the row's real value 3, but let's explicitly
    // null it to simulate "blank in the file" against a row that currently
    // has cut=50 in the DB — must NOT diff to null.
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-CO1', { [CUT_IDX]: null })] }])

    const result = await svc.previewImport('0X220', buffer)
    expect(result.changes.find(c => c.field === 'cut')).toBeUndefined()
  })

  it('matches a mark via stripContractPrefix fallback when the exact mark is not found', async () => {
    // 0X220-2TC-CO1 is a raw Tekla-style mark with the contract prefix
    // still attached — our clean assembly_mark is 'TC-CO1'.
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('0X220-2TC-CO1', { [CUT_IDX]: 90 })] }])

    const result = await svc.previewImport('0X220', buffer)
    expect(result.unmatchedMarks).toEqual([])
    expect(result.changes).toEqual([{ zone: 'Zone-A', mark: '0X220-2TC-CO1', field: 'cut', old: 3, new: 90 }])
  })

  it('a computed display-only column\'s value is never read, even if a formula/text sits there', async () => {
    const sumProgressIdx = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.computed === 'fab_overall_pct')
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-CO1', { [sumProgressIdx]: '999%' })] }])

    const result = await svc.previewImport('0X220', buffer)
    expect(result.changes).toEqual([])
    expect(result.skippedCells).toEqual([])
  })
})

describe('ProgressImportService.confirmImport', () => {
  it('applies only rows with a non-empty diff, in one transaction, and logs an import batch', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-CO1', { [CUT_IDX]: 80 })] }])

    const result = await svc.confirmImport('0X220', buffer, 'test.xlsx', 1)
    expect(result.updated).toBe(1)
    expect(prisma.bom_assembly_progress.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.progress_change_batch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'import', file_name: 'test.xlsx' }) }),
    )
  })

  it('an unchanged round-trip writes nothing and logs no batch', async () => {
    const prisma = makePrisma()
    const svc = makeService(prisma)
    const buffer = buildWorkbookBuffer('0X220', [{ name: 'Zone-A', rows: [baseRow('TC-CO1')] }])

    const result = await svc.confirmImport('0X220', buffer, 'test.xlsx', 1)
    expect(result).toEqual({ batchId: null, updated: 0 })
    expect(prisma.bom_assembly_progress.upsert).not.toHaveBeenCalled()
    expect(prisma.progress_change_batch.create).not.toHaveBeenCalled()
  })
})
