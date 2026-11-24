import { PDFDocument } from 'pdf-lib'
import { buildJobSheetPdf } from './job-sheet-pdf-builder'
import type { JobSheet, JobSheetPlan } from './job-sheet.types'

// Per-piece job sheet — PDF builder spec (partly todo; not yet run under Jest).
// Needs backend/assets/fonts/sarabun (run from backend/, as the print packet
// specs do). Layout assertions are deliberately few: the form is a DRAFT
// until production / QA approve it.

const sheet = (over: Partial<JobSheet> = {}): JobSheet => ({
  moId: 1,
  moCode: 'MO-00001',
  moRevision: 1,
  sheetNo: 1,
  pieceId: 'MO-00001/A12/P101/01-02',
  pieceNo: 1,
  pieceTotal: 2,
  projectCode: 'P001',
  projectName: 'Demo project',
  zoneLabel: 'Z1',
  subZoneName: null,
  assemblyMark: 'A12',
  assemblyName: 'Column',
  partMark: 'P101',
  description: 'Base plate',
  profile: 'PL12x200',
  grade: 'SS400',
  length_mm: 500,
  width_mm: 200,
  thickness_mm: 12,
  unitWeight_kg: 9.42,
  qtyPerAssembly: 2,
  heatNo: null,
  plateId: null,
  dueDate: new Date('2026-12-01T00:00:00Z'),
  holes: [{ diameter_mm: 22, count: 4 }],
  holesKnown: true,
  routing: [
    { sequence: 10, operationLabel: 'CUT — Cutting', workCenterName: 'Saw', woCode: 'WO-TEST-0010', woId: 10 },
    { sequence: 20, operationLabel: 'DRILL — Drilling', workCenterName: 'Drill line', woCode: 'WO-TEST-0011', woId: 11 },
  ],
  drawings: [{ file_name: 'A12.pdf', rev: 1, uploaded_at: new Date('2026-11-01T00:00:00Z') }],
  qrUrl: 'http://localhost:5173/order/wo/10?rev=1&asm=A12&part=P101&piece=1%2F2',
  source: 'BOM_PART',
  ...over,
})

const plan = (sheets: JobSheet[]): JobSheetPlan => ({
  mo: { id: 1, mo_code: 'MO-00001', revision: 1, plan_finish: new Date('2026-12-01T00:00:00Z') },
  mode: 'piece',
  sheets,
  generatedAt: new Date('2026-11-23T15:00:00Z'),
})

describe('buildJobSheetPdf', () => {
  it('builds one A4 portrait page per sheet, with the save-as title', async () => {
    const bytes = await buildJobSheetPdf(plan([sheet(), sheet({ sheetNo: 2, pieceNo: 2, pieceId: 'MO-00001/A12/P101/02-02' })]), 'en')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
    const { width, height } = doc.getPage(0).getSize()
    expect(Math.round(width)).toBe(595)
    expect(Math.round(height)).toBe(842)
    expect(doc.getTitle()).toBe('JOBSHEET-MO-00001-20261123-220000')
  })

  it('renders Thai labels without throwing (embedded Sarabun)', async () => {
    const bytes = await buildJobSheetPdf(plan([sheet({ description: 'แผ่นฐานเสา', projectName: 'โครงการทดสอบ' })]), 'th')
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('prints a sheet with no holes data, no routing, no drawing and no dates (all hand-fill)', async () => {
    const bare = sheet({ holes: [], holesKnown: false, routing: [], drawings: [], dueDate: null, profile: null, grade: null, length_mm: null, width_mm: null, thickness_mm: null, unitWeight_kg: null, description: null, assemblyName: null })
    await expect(buildJobSheetPdf(plan([bare]), 'th')).resolves.toBeInstanceOf(Uint8Array)
  })

  it('survives over-long values and long routings (fit / cap, never overflow or throw)', async () => {
    const long = sheet({
      partMark: 'P'.repeat(80),
      profile: 'X'.repeat(120),
      routing: Array.from({ length: 40 }, (_, i) => ({ sequence: (i + 1) * 10, operationLabel: `OP${i} — ${'long '.repeat(20)}`, workCenterName: 'WC', woCode: `WO-${i}`, woId: i })),
      holes: Array.from({ length: 12 }, (_, i) => ({ diameter_mm: 10 + i, count: i + 1 })),
    })
    await expect(buildJobSheetPdf(plan([long]), 'en')).resolves.toBeInstanceOf(Uint8Array)
  }, 20_000) // ~4 s alone (many long rows); headroom so a loaded CI runner does not hit the 5 s default

  it('zone batch (mo = null): builds every sheet and titles the file after the zone', async () => {
    const zonePlan: JobSheetPlan = {
      ...plan([sheet(), sheet({ moId: 2, moCode: 'MO-00002', moRevision: 0, sheetNo: 2, pieceId: 'MO-00002/A12/P101/01-01' })]),
      mo: null,
      zone: { id: 5, code: 'Z1', label: 'Zone 1', projectCode: 'P001', subZoneId: null, moCodes: ['MO-00001', 'MO-00002'], skippedMoCodes: [] },
    }
    const doc = await PDFDocument.load(await buildJobSheetPdf(zonePlan, 'th'))
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getTitle()).toBe('JOBSHEET-ZONE-Z1-20261123-220000')
  })

  it.todo('heat number / plate id print in their boxes when present (plate heat traceability), blank hand-fill hint when null')
  it.todo('part mode: the Piece cell prints "Qty N pcs (one sheet for all)"')
  it.todo('sheets sharing one QR url embed the QR image once')
  it.todo('text extraction: part mark, MO code and every routing WO code appear on the page')
})
