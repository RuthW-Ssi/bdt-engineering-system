import * as ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { ProgressExportService } from './progress-export.service'
import { PROGRESS_EXPORT_COLUMNS, META_SHEET_NAME, GROUP_LABELS, DATA_START_ROW, computeColumnGroups } from './progress-excel'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 1, project_code: '0X220', name: 'สนามไดร์ฟกอล์ฟ บางนา' }) },
    project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, label: 'Zone-A' }]) },
    bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any
}

async function readBack(buffer: ExcelJS.Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

// ExcelJS's own object model mirrors a merged range's master value across
// every cell in that range when read back in-process — great for humans
// opening the file in Excel, misleading for asserting "this cell has no
// value of its own". progress-import.service.ts reads with `xlsx` instead,
// which reflects the real stored bytes (only the master cell has a value) —
// so structural assertions about blank/non-master cells go through `xlsx`,
// the same library import actually validates against.
function readBackRaw(buffer: ExcelJS.Buffer, sheetName: string): unknown[][] {
  const wb = XLSX.read(buffer as unknown as Buffer, { type: 'buffer' })
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null })
}

// Mirrors progress-export.service.ts's own (unexported) column-letter helper.
function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const MARK_COL = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.kind === 'mark') + 1 // 1-indexed
const CUT_COL = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.field === 'cut') + 1
const CLAIMED_WEIGHT_COL = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.field === 'claimed_weight_kg') + 1
const PAYMENT_STATUS_COL = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.field === 'payment_status') + 1
const ERECTED_PCS_COL = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.field === 'erected_pcs') + 1
const SUM_PROGRESS_COL = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.computed === 'fab_overall_pct') + 1

describe('ProgressExportService.exportProgress', () => {
  it('filename encodes project code + export date', async () => {
    const prisma = makePrisma()
    const svc = new ProgressExportService(prisma)
    const { filename } = await svc.exportProgress('0X220')
    expect(filename).toMatch(/^0X220_progress_\d{4}-\d{2}-\d{2}\.xlsx$/)
  })

  it('writes a hidden _meta sheet with project_code + exported_at, added first', async () => {
    const prisma = makePrisma()
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    expect(wb.worksheets[0].name).toBe(META_SHEET_NAME)
    expect(wb.worksheets[0].state).toBe('veryHidden')
    const metaRows = wb.getWorksheet(META_SHEET_NAME)!.getRows(1, 2)!.map(r => (r.values as unknown[]).slice(1))
    expect(metaRows).toEqual([['project_code', '0X220'], ['exported_at', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]])
  })

  it('row 1 is a title merged across every column, mentioning the project only (not the zone)', async () => {
    const prisma = makePrisma()
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const sheet = wb.getWorksheet('Zone-A')!
    const title = sheet.getCell(1, 1).value as string
    expect(title).toContain('สนามไดร์ฟกอล์ฟ บางนา')
    expect(title).not.toContain('Zone-A')
    expect(sheet.getCell(1, 1).master).toBe(sheet.getCell(1, 1)) // top-left of its own merge
    expect(sheet.getCell(1, PROGRESS_EXPORT_COLUMNS.length).isMerged).toBe(true)
  })

  it('row 2 carries group labels over their span, and standalone headers elsewhere', async () => {
    const prisma = makePrisma()
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const sheet = wb.getWorksheet('Zone-A')!
    const row2 = (sheet.getRow(2).values as unknown[]).slice(1)
    const fabStartCol = computeColumnGroups().find(g => g.group === 'fabrication')!.startCol
    expect(row2[0]).toBe('ลำดับ')
    expect(row2[MARK_COL - 1]).toBe('Number')
    expect(row2[fabStartCol - 1]).toBe(GROUP_LABELS.fabrication)
    expect(row2[SUM_PROGRESS_COL - 1]).toBe('SUM Progress By PCS.')
    expect(row2[PAYMENT_STATUS_COL - 2]).toBe(GROUP_LABELS.payment) // payment group's first column
  })

  it('row 3 ("ผู้รับผิดชอบ") carries the legacy sheet\'s own responsible-person text per group', async () => {
    const prisma = makePrisma()
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const aoa = readBackRaw(buffer, 'Zone-A')
    const fabStartCol = computeColumnGroups().find(g => g.group === 'fabrication')!.startCol
    expect(aoa[2][fabStartCol - 1]).toBe('ผู้รับผิดชอบ : Kirati BDP')
    expect(aoa[2][0]).toBeNull() // standalone columns have no row-3 content of their own
  })

  it('row 4 carries each group member\'s real sub-header', async () => {
    const prisma = makePrisma()
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const row4 = (wb.getWorksheet('Zone-A')!.getRow(4).values as unknown[]).slice(1)
    expect(row4[CUT_COL - 1]).toBe('Cut')
    expect(row4[PAYMENT_STATUS_COL - 1]).toBe('สถานะการเบิกเงิน')
  })

  it('data starts at DATA_START_ROW; an assembly with no progress row yet exports blank cells, not zeros', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { assembly_mark: 'TC-CO1', name: 'COLUMN', weight_kg: 100, qty: 2, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 8000, progress: null, dispatch: { zone_id: 10 } },
        ]),
      },
    })
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const dataRow = (wb.getWorksheet('Zone-A')!.getRow(DATA_START_ROW).values as unknown[]).slice(1)
    expect(dataRow[MARK_COL - 1]).toBe('TC-CO1')
    expect(dataRow[CUT_COL - 1]).toBeFalsy() // exceljs reads an empty cell as undefined/null, never 0
    expect(dataRow[SUM_PROGRESS_COL - 1]).toBeFalsy() // computed columns are blank too when there's no progress row
  })

  it('an assembly WITH a progress row exports its real + computed values', async () => {
    const progress = {
      cut: 100, buildup: 100, weld1: 100, fitup_drill: 100, weld2: 100, qc_inspection: 100, primer: 100, fireproof: 100, top_coat: 100, qc_final: 100,
      plan_load_date: null, actual_load_date: null, loaded_pcs: 0,
      claimed_weight_kg: 12.5, delivered_weight_kg: null, payment_status: 'Paid',
      erected_pcs: 1, erection_actual_finish_date: null,
    }
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { assembly_mark: 'TC-CO1', name: 'COLUMN', weight_kg: 100, qty: 2, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null, progress, dispatch: { zone_id: 10 } },
        ]),
      },
    })
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const dataRow = (wb.getWorksheet('Zone-A')!.getRow(DATA_START_ROW).values as unknown[]).slice(1)
    expect(dataRow[CUT_COL - 1]).toBe(100)
    expect(dataRow[CLAIMED_WEIGHT_COL - 1]).toBe(12.5)
    expect(dataRow[PAYMENT_STATUS_COL - 1]).toBe('Paid')
    expect(dataRow[ERECTED_PCS_COL - 1]).toBe(1)
    // all 10 fab stages at 100% -> row's own weighted overall fab % is 100
    expect(dataRow[SUM_PROGRESS_COL - 1]).toBe(100)
    // sole row in its zone -> its weighted contribution equals the zone total (100%)
    expect(dataRow[SUM_PROGRESS_COL]).toBe(100) // 'Progress Overall (%)' is the very next column
    // erected 1 of qty 2 -> 50%
    expect(dataRow[ERECTED_PCS_COL]).toBeUndefined() // Actual Erection (date), blank here
    expect(dataRow[ERECTED_PCS_COL + 1]).toBe(50) // 'Erection by Weight (kg.)' = weight*erected/qty = 100*1/2=50
    expect(dataRow[ERECTED_PCS_COL + 2]).toBe(50) // 'Progress % by Pcs' = erected/qty = 1/2 = 50%
  })

  it('fills match the legacy sheet\'s own colors: gray header, green on hand-tracked cells', async () => {
    const progress = {
      cut: 100, buildup: 100, weld1: 100, fitup_drill: 100, weld2: 100, qc_inspection: 100, primer: 100, fireproof: 100, top_coat: 100, qc_final: 100,
      plan_load_date: null, actual_load_date: new Date('2026-06-01'), loaded_pcs: 5,
      claimed_weight_kg: 12.5, delivered_weight_kg: null, payment_status: 'Paid',
      erected_pcs: 1, erection_actual_finish_date: new Date('2026-06-05'),
    }
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { assembly_mark: 'TC-CO1', name: 'COLUMN', weight_kg: 100, qty: 2, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null, progress, dispatch: { zone_id: 10 } },
        ]),
      },
    })
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const sheet = wb.getWorksheet('Zone-A')!
    const fillArgb = (r: number, c: number) => {
      const fill = sheet.getCell(r, c).fill as ExcelJS.FillPattern
      return fill?.fgColor && 'argb' in fill.fgColor ? fill.fgColor.argb : undefined
    }

    expect(fillArgb(1, 1)).toBe('FFD9D9D9') // title row
    expect(fillArgb(2, MARK_COL)).toBe('FFD9D9D9') // header row

    const r = DATA_START_ROW
    expect(fillArgb(r, CUT_COL)).toBe('FFF4FCA6') // fab stage data cell
    expect(fillArgb(r, ERECTED_PCS_COL)).toBe('FFF4FCA6') // Erection by Pcs.
    expect(fillArgb(r, MARK_COL)).toBeUndefined() // readonly/reference columns stay unfilled
    expect(fillArgb(r, CLAIMED_WEIGHT_COL)).toBeUndefined() // editable but not fab-tracked in the legacy sheet either
    expect(fillArgb(r, PAYMENT_STATUS_COL)).toBeUndefined() // no flat fill — colored via conditional formatting instead
  })

  it('header rows use the legacy sheet\'s own font (Angsana New) at its per-row sizes', async () => {
    const prisma = makePrisma()
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const sheet = wb.getWorksheet('Zone-A')!
    const fabStartCol = computeColumnGroups().find(g => g.group === 'fabrication')!.startCol
    expect(sheet.getCell(1, 1).font).toMatchObject({ name: 'Angsana New', size: 16, bold: true }) // title
    expect(sheet.getCell(2, MARK_COL).font).toMatchObject({ name: 'Angsana New', size: 12, bold: true }) // standalone column header
    expect(sheet.getCell(2, fabStartCol).font).toMatchObject({ name: 'Angsana New', size: 16, bold: true }) // group label
    expect(sheet.getCell(3, fabStartCol).font).toMatchObject({ name: 'Angsana New', size: 12, bold: true }) // ผู้รับผิดชอบ
    expect(sheet.getCell(4, CUT_COL).font).toMatchObject({ name: 'Angsana New', size: 9, bold: true }) // sub-header
  })

  it('payment status is colored by real Excel conditional formatting, one rule per value — not a flat fill', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { assembly_mark: 'TC-CO1', name: 'COLUMN', weight_kg: 100, qty: 2, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null, progress: { payment_status: 'Paid' }, dispatch: { zone_id: 10 } },
        ]),
      },
    })
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const sheet = wb.getWorksheet('Zone-A')!
    const cfs = (sheet as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[] }[] }[] }).conditionalFormattings
    expect(cfs).toHaveLength(1)
    const col = colLetter(PAYMENT_STATUS_COL)
    expect(cfs[0].ref).toBe(`${col}${DATA_START_ROW}:${col}${DATA_START_ROW}`)
    expect(cfs[0].rules.map(r => r.formulae[0])).toEqual(['"Not Disbursed"', '"Disbursed"', '"Paid"'])
  })

  it('every header and data cell gets a thin black border on all 4 sides, matching the legacy sheet\'s grid', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { assembly_mark: 'TC-CO1', name: 'COLUMN', weight_kg: 100, qty: 2, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null, progress: null, dispatch: { zone_id: 10 } },
        ]),
      },
    })
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const sheet = wb.getWorksheet('Zone-A')!
    const FULL_THIN = { top: { style: 'thin', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } }, right: { style: 'thin', color: { argb: 'FF000000' } } }
    for (const r of [1, 2, 4]) expect(sheet.getCell(r, MARK_COL).border).toEqual(FULL_THIN)
    expect(sheet.getCell(DATA_START_ROW, MARK_COL).border).toEqual(FULL_THIN)
    expect(sheet.getCell(DATA_START_ROW, CUT_COL).border).toEqual(FULL_THIN)
  })

  it('zone sheet names are sanitized/deduped the same way import will expect', async () => {
    const prisma = makePrisma({
      project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, label: 'Zone: A' }, { id: 11, label: 'Zone: A' }]) },
    })
    const svc = new ProgressExportService(prisma)
    const { buffer } = await svc.exportProgress('0X220')

    const wb = await readBack(buffer)
    const names = wb.worksheets.map(w => w.name).filter(n => n !== META_SHEET_NAME)
    expect(names).toEqual(['Zone A', 'Zone A~1'])
  })
})
