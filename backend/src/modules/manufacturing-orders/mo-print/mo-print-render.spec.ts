import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { PDFDocument } from 'pdf-lib'
import { MAX_QUEUED, MAX_WORKERS, renderPrintPdf } from './mo-print-render'
import type { MoPrintPacketPlan, MoPrintWorkOrderRow } from './mo-print.service'

// Print packet on a worker thread (2026-11-05). Runs the real worker from its
// .ts source through ts-node, so the thread hand-off itself is exercised.
const WORKER = { file: path.join(__dirname, 'mo-print-worker.ts'), execArgv: ['-r', 'ts-node/register/transpile-only'] }
jest.setTimeout(60000)

async function drawingPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]).drawLine({ start: { x: 0, y: 0 }, end: { x: 200, y: 200 } })
  return doc.save()
}

const sheet = (key: string) => ({ file_key: key, file_name: `${key}.pdf`, rev: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') })
function row(id: number, sheets: ReturnType<typeof sheet>[]): MoPrintWorkOrderRow {
  return {
    wo: { id, wo_code: `WO-${id}`, sequence: 10, status: 'NOT_STARTED', expected_duration_min: 60, setup_time_min: 15, created_at: new Date('2026-09-20T00:00:00Z') },
    workCenterName: 'Cutting', projectName: 'โครงการทดสอบ', projectCode: 'DBN', zoneLabel: 'Zone 1', subZoneName: null,
    activities: [], woUrl: `http://localhost:5173/order/wo/${id}`, consume: [], operationLabel: null,
    marks: [{ assemblyMark: `M-${id}`, sourceLabel: 'BOM rev 1', renamedFrom: null, name: null, qty: 1, weight_kg: null, drawings: sheets }],
    assignedTo: null, teamHeadcount: 1, icon: null, planStart: null, planEnd: null,
  }
}
function plan(rows: MoPrintWorkOrderRow[]): MoPrintPacketPlan {
  return {
    mo: { id: 85, mo_code: 'MO-00014', plan_start: new Date('2026-11-01T00:00:00Z'), plan_finish: null, actual_start: null, actual_finish: null, status: 'CONFIRMED', primary_mark_prefix_code: null, shop_type: 'FULL_SHOP' as const, revision: 0, preshopRemaining: false, projectCode: null, projectName: null, zoneLabel: null, subZoneName: null },
    rows, routingOps: [], marks: [], assemblyParts: [],
  }
}

describe('renderPrintPdf — worker thread', () => {
  it('builds the same pages as in-process, asking the main thread for each sheet in order', async () => {
    const p = plan([row(1, [sheet('a'), sheet('b')]), row(2, [sheet('c')])])
    const asked: string[] = []
    const fetch = async (_r: unknown, _m: unknown, s: { file_key: string }) => {
      asked.push(s.file_key)
      return drawingPdf(s.file_key === 'b' ? 2 : 1)
    }
    const viaWorker = await PDFDocument.load(await renderPrintPdf(p, fetch, true, 'th', WORKER))
    expect(asked).toEqual(['a', 'b', 'c'])
    const inProcess = await PDFDocument.load(await renderPrintPdf(p, fetch, true, 'th', { file: '/nope.js', execArgv: [] }))
    // manifest + (traveler + 3 drawing pages) + (traveler + 1 drawing page)
    expect(viaWorker.getPageCount()).toBe(7)
    expect(viaWorker.getPageCount()).toBe(inProcess.getPageCount())
  })

  it('a drawing that cannot be read fails the print with that reason', async () => {
    const p = plan([row(1, [sheet('a')])])
    const fetch = async () => { throw new Error('Failed to read drawing "a.pdf" for WO-1 (mark M-1): gone') }
    await expect(renderPrintPdf(p, fetch, true, 'en', WORKER)).rejects.toThrow('Failed to read drawing "a.pdf" for WO-1 (mark M-1): gone')
  })
})

// Stub workers (plain JS) for the queue and crash paths, so those tests don't
// pay for real PDF layout: `echo` asks for sheet 0/0/0 and returns its bytes.
describe('renderPrintPdf — queue limits and worker failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-print-render-'))
  const stub = (name: string, body: string) => {
    const file = path.join(dir, name)
    fs.writeFileSync(file, `const { parentPort } = require('worker_threads')\n${body}`)
    return { file, execArgv: [] as string[] }
  }
  const ECHO = stub('echo.js', `parentPort.on('message', (m) => {
    if (m.type === 'job') parentPort.postMessage({ type: 'fetch', id: 0, r: 0, m: 0, s: 0 })
    else if (m.type === 'bytes') parentPort.postMessage({ type: 'done', bytes: m.bytes })
    else parentPort.postMessage({ type: 'error', message: m.message })
  })`)
  const CRASH = stub('crash.js', `parentPort.on('message', () => process.exit(1))`)
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  const p = () => plan([row(1, [sheet('a')])])
  // fetch that holds every render open until release() is called
  function gate() {
    let open!: () => void
    const opened = new Promise<void>((r) => { open = r })
    return { release: () => open(), fetch: async () => { await opened; return new Uint8Array([1, 2, 3]) } }
  }

  it(`renders at most ${MAX_WORKERS} packets at once; the rest wait their turn and still finish`, async () => {
    const g = gate()
    let asked = 0
    const fetch = () => { asked++; return g.fetch() }
    const jobs = Array.from({ length: MAX_WORKERS + 2 }, () => renderPrintPdf(p(), fetch, true, 'en', ECHO))
    while (asked < MAX_WORKERS) await new Promise((r) => setTimeout(r, 10))
    await new Promise((r) => setTimeout(r, 200)) // the waiting two must not have started
    expect(asked).toBe(MAX_WORKERS)
    g.release()
    expect(await Promise.all(jobs)).toHaveLength(MAX_WORKERS + 2)
    expect(asked).toBe(MAX_WORKERS + 2)
  })

  it(`a full line (${MAX_WORKERS} rendering + ${MAX_QUEUED} waiting) turns the next print away with 503 PRINT_BUSY; the rest still finish`, async () => {
    const g = gate()
    const held = Array.from({ length: MAX_WORKERS + MAX_QUEUED }, () => renderPrintPdf(p(), g.fetch, true, 'en', ECHO))
    const extra = await renderPrintPdf(p(), g.fetch, true, 'en', ECHO).catch((e) => e)
    expect(extra.getStatus()).toBe(503)
    expect(extra.getResponse()).toMatchObject({ code: 'PRINT_BUSY' })
    g.release()
    expect(await Promise.all(held)).toHaveLength(MAX_WORKERS + MAX_QUEUED)
  })

  it('a print that cannot start within the wait limit gets 503 PRINT_BUSY and leaves the line', async () => {
    const g = gate()
    const held = Array.from({ length: MAX_WORKERS }, () => renderPrintPdf(p(), g.fetch, true, 'en', ECHO))
    const waited = await renderPrintPdf(p(), g.fetch, true, 'en', ECHO, 200).catch((e) => e)
    expect(waited.getResponse()).toMatchObject({ code: 'PRINT_BUSY' })
    g.release()
    await Promise.all(held)
    // the timed-out entry is gone, so a new print runs straight away
    await expect(renderPrintPdf(p(), async () => new Uint8Array([9]), true, 'en', ECHO)).resolves.toEqual(new Uint8Array([9]))
  })

  it('a worker that dies fails only its own print; the next prints still run', async () => {
    const crashed = Array.from({ length: MAX_WORKERS + 1 }, () => renderPrintPdf(p(), async () => new Uint8Array(), true, 'en', CRASH).catch((e) => e))
    for (const e of await Promise.all(crashed)) expect(e.message).toMatch(/stopped unexpectedly \(exit 1\)/)
    await expect(renderPrintPdf(p(), async () => new Uint8Array([7]), true, 'en', ECHO)).resolves.toEqual(new Uint8Array([7]))
  })
})
