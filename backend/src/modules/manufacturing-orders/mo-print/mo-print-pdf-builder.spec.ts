import { PDFDocument } from 'pdf-lib'
import { buildMoPrintPdf } from './mo-print-pdf-builder'
import type { MoPrintPacketPlan, MoPrintWorkOrderRow } from './mo-print.service'

async function fakePdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
  return doc.save()
}

function makeRow(overrides: Partial<MoPrintWorkOrderRow> = {}): MoPrintWorkOrderRow {
  return {
    wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 60 },
    workCenterName: 'Cutting',
    assemblyMark: 'DBN-A1-CTR1',
    qty: 1,
    zoneLabel: 'BIF Zone 1',
    subZoneName: null,
    projectName: 'Smash golf driving range Bangna',
    projectCode: 'DBN',
    drawing: { file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', file_name: 'DBN-A1-CTR1 - - Rev 1.pdf' },
    ...overrides,
  }
}

function makePlan(rows: MoPrintWorkOrderRow[]): MoPrintPacketPlan {
  return {
    mo: { id: 85, mo_code: 'MO-00014', due_date: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR' },
    rows,
  }
}

describe('buildMoPrintPdf', () => {
  it('produces one manifest page + (1 traveler + N drawing pages) per WO row, in order', async () => {
    const plan = makePlan([
      makeRow({ wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 60 } }),
      makeRow({ wo: { id: 1399, wo_code: 'WO-00000740', sequence: 20, status: 'NOT_STARTED', expected_duration_min: 30 } }),
    ])
    const drawingPageCounts = [1, 2] // first WO's drawing has 1 page, second has 2
    let call = 0
    const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(drawingPageCounts[call++]))

    const bytes = await buildMoPrintPdf(plan, fetchDrawingBytes)
    const merged = await PDFDocument.load(bytes)

    // 1 manifest + (1 traveler + 1 drawing page) + (1 traveler + 2 drawing pages)
    expect(merged.getPageCount()).toBe(1 + (1 + 1) + (1 + 2))
    expect(fetchDrawingBytes).toHaveBeenCalledTimes(2)
  })

  it('produces just the manifest page when there are no rows', async () => {
    const bytes = await buildMoPrintPdf(makePlan([]), jest.fn())
    const merged = await PDFDocument.load(bytes)
    expect(merged.getPageCount()).toBe(1)
  })

  it('calls fetchDrawingBytes with the matching row so the caller knows which file to fetch', async () => {
    const row = makeRow()
    const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(1))

    await buildMoPrintPdf(makePlan([row]), fetchDrawingBytes)

    expect(fetchDrawingBytes).toHaveBeenCalledWith(row)
  })

  // Regression: project/zone names in this app are routinely Thai (e.g.
  // "โกดังเก็บสินค้า Zone B") — pdf-lib's built-in StandardFonts only encode
  // WinAnsi (Latin-1) and throw on the first non-Latin character. Live-caught
  // on local dev while verifying this feature end-to-end (2026-09-15).
  it('does not throw when the project/zone/mark text contains Thai characters', async () => {
    const plan = makePlan([
      makeRow({ projectName: 'โกดังเก็บสินค้า Zone B', zoneLabel: 'โกดัง Zone B-1' }),
    ])

    await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
  })
})
