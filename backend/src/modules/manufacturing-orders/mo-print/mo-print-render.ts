import * as fs from 'fs'
import * as path from 'path'
import { Worker } from 'worker_threads'
import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { buildMoPrintPdf } from './mo-print-pdf-builder'
import type { PrintLang } from './mo-print-labels'
import type { MoPrintAssemblyMarkRow, MoPrintPacketPlan, MoPrintWorkOrderRow } from './mo-print.service'

// Runs buildMoPrintPdf on a worker thread (2026-11-05). The 11-04 load test
// showed a big print packet blocks the event loop for seconds, so everyone on
// that Cloud Run instance waits — the instance count stays the same (no cost);
// only the CPU-heavy layout moves off the request thread.
//
// - Drawing bytes still come from the main thread's `fetchDrawing` (file
//   storage lives here), one sheet per request from the worker.
// - At most MAX_WORKERS packets render at once per instance; more wait in line
//   (each worker is its own V8 heap; 1 vCPU gains nothing from more). Up to
//   MAX_QUEUED wait; beyond that, or after QUEUE_WAIT_MS in line → 503 PRINT_BUSY.
// - A packet that takes longer than RENDER_TIMEOUT_MS is stopped and fails.
// - No compiled worker file (Jest runs the .ts sources) → renders in-process.
type FetchDrawing = (row: MoPrintWorkOrderRow, mark: MoPrintAssemblyMarkRow, sheet: MoPrintAssemblyMarkRow['drawings'][number]) => Promise<Uint8Array>

export interface RenderJob { plan: MoPrintPacketPlan; includeManifest: boolean; lang: PrintLang }
export type ToWorker =
  | { type: 'job'; job: RenderJob }
  | { type: 'bytes'; id: number; bytes: Uint8Array }
  | { type: 'fetchError'; id: number; message: string }
export type ToMain =
  | { type: 'fetch'; id: number; r: number; m: number; s: number }
  | { type: 'done'; bytes: Uint8Array }
  | { type: 'error'; message: string }

export const MAX_WORKERS = 2
export const MAX_QUEUED = 6
export const QUEUE_WAIT_MS = 60_000
export const RENDER_TIMEOUT_MS = 120_000
const WORKER_HEAP_MB = 768
const DEFAULT_WORKER = { file: path.join(__dirname, 'mo-print-worker.js'), execArgv: [] as string[] }

// Security review M1 (2026-11-05): someone holding F5 on Print must not line
// up hundreds of packets ahead of everyone else, so the line is short and a
// packet that can't start within a minute is turned away (503, try again).
const busy = () => new ServiceUnavailableException({ message: 'มีการสั่งพิมพ์อยู่หลายรายการ — รอสักครู่แล้วลองใหม่', code: 'PRINT_BUSY' })

const logger = new Logger('MoPrintRender')
let warnedNoWorker = false
let running = 0
const queue: (() => void)[] = []

async function slot<T>(task: () => Promise<T>, waitMs: number): Promise<T> {
  if (running < MAX_WORKERS) running++
  else {
    if (queue.length >= MAX_QUEUED) throw busy()
    await new Promise<void>((resolve, reject) => {
      const take = () => { clearTimeout(timer); resolve() }
      const timer = setTimeout(() => {
        queue.splice(queue.indexOf(take), 1)
        reject(busy())
      }, waitMs)
      queue.push(take)
    })
  }
  try {
    return await task()
  } finally {
    const next = queue.shift()
    if (next) next() // hand the slot straight over
    else running--
  }
}

export function renderPrintPdf(
  plan: MoPrintPacketPlan,
  fetchDrawing: FetchDrawing,
  includeManifest: boolean,
  lang: PrintLang,
  worker = DEFAULT_WORKER,
  queueWaitMs = QUEUE_WAIT_MS,
): Promise<Uint8Array> {
  if (!fs.existsSync(worker.file)) {
    if (process.env.NODE_ENV === 'production' && !warnedNoWorker) {
      warnedNoWorker = true
      logger.warn(`${worker.file} missing — print packets render on the request thread`)
    }
    return buildMoPrintPdf(plan, fetchDrawing, includeManifest, lang)
  }
  return slot(() => runWorker(plan, fetchDrawing, { plan, includeManifest, lang }, worker), queueWaitMs)
}

function runWorker(plan: MoPrintPacketPlan, fetchDrawing: FetchDrawing, job: RenderJob, worker: typeof DEFAULT_WORKER) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const w = new Worker(worker.file, { execArgv: worker.execArgv, resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB } })
    let settled = false
    const finish = (err: Error | null, bytes?: Uint8Array) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void w.terminate()
      if (err) reject(err)
      else resolve(bytes!)
    }
    const timer = setTimeout(() => finish(new Error(`Print packet took longer than ${RENDER_TIMEOUT_MS / 1000}s and was stopped`)), RENDER_TIMEOUT_MS)

    w.on('message', (msg: ToMain) => {
      if (msg.type === 'done') return finish(null, msg.bytes)
      if (msg.type === 'error') return finish(new Error(msg.message))
      const row = plan.rows[msg.r]
      const mark = row?.marks[msg.m]
      const sheet = mark?.drawings[msg.s]
      if (!sheet) return finish(new Error(`Print worker asked for an unknown drawing (${msg.r}/${msg.m}/${msg.s})`))
      fetchDrawing(row, mark, sheet).then(
        // Copied, not transferred: storage may hand back a Buffer that is a
        // slice of Node's shared pool, whose whole ArrayBuffer can't be moved.
        (bytes) => !settled && w.postMessage({ type: 'bytes', id: msg.id, bytes } satisfies ToWorker),
        (err) => !settled && w.postMessage({ type: 'fetchError', id: msg.id, message: err instanceof Error ? err.message : String(err) } satisfies ToWorker),
      ).catch((err) => finish(err instanceof Error ? err : new Error(String(err))))
    })
    w.on('error', (err) => finish(err))
    w.on('messageerror', (err) => finish(err))
    w.on('exit', (code) => finish(new Error(`Print worker stopped unexpectedly (exit ${code})`)))
    try {
      w.postMessage({ type: 'job', job } satisfies ToWorker)
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err))) // plan not cloneable → stop the worker now
    }
  })
}
