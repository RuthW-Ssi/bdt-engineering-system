import { renderJobSheetPdf } from './job-sheet-render'
import type { JobSheetPlan } from './job-sheet.types'

// Job sheet render wrapper spec (partly todo; not yet run under Jest). Mirrors
// mo-print-render.spec.ts: under Jest there is no compiled worker file, so
// the in-process fallback is what runs; the worker cases stay todo until
// someone points `worker` at a compiled fixture the way that spec does.
const plan: JobSheetPlan = {
  mo: { id: 1, mo_code: 'MO-00001', revision: 1, plan_finish: null },
  mode: 'part',
  generatedAt: new Date('2026-11-23T15:00:00Z'),
  sheets: [{
    moId: 1, moCode: 'MO-00001', moRevision: 1,
    sheetNo: 1, pieceId: 'MO-00001/A12/P101/x4', pieceNo: null, pieceTotal: 4,
    projectCode: 'P001', projectName: 'Demo', zoneLabel: 'Z1', subZoneName: null,
    assemblyMark: 'A12', assemblyName: null, partMark: 'P101', description: null,
    profile: 'PL12', grade: 'SS400', length_mm: 500, width_mm: null, thickness_mm: 12, unitWeight_kg: 9.42, qtyPerAssembly: 4,
    heatNo: null, plateId: null, dueDate: null, holes: [], holesKnown: false, routing: [], drawings: [],
    qrUrl: 'http://localhost:5173/mo/1?rev=1&asm=A12&part=P101', source: 'BOM_PART',
  }],
}

describe('renderJobSheetPdf', () => {
  it('renders in-process when the compiled worker file is missing', async () => {
    const bytes = await renderJobSheetPdf(plan, 'en', { file: '/nonexistent/job-sheet-worker.js', execArgv: [] })
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it.todo('renders on a worker thread and returns the same page count')
  it.todo('shares the print packet render slots: a full queue rejects with 503 PRINT_BUSY')
  it.todo('a worker that throws rejects with its message; a worker that exits early rejects')
})
