import * as fs from 'fs'
import * as path from 'path'
import { Worker } from 'worker_threads'
import { Logger } from '@nestjs/common'
import { QUEUE_WAIT_MS, RENDER_TIMEOUT_MS, slot } from '../mo-print/mo-print-render'
import type { PrintLang } from '../mo-print/mo-print-labels'
import { buildJobSheetPdf } from './job-sheet-pdf-builder'
import type { JobSheetPlan } from './job-sheet.types'

// Runs buildJobSheetPdf on a worker thread — same approach and the SAME
// render slots as the MO print packet (mo-print-render.ts `slot`), so job
// sheets and packets together never exceed MAX_WORKERS renders per instance
// and a long queue is turned away with 503 PRINT_BUSY.
//
// Simpler than the packet's worker protocol: a job sheet embeds no drawing
// bytes (it prints the drawing reference only), so there is no fetch
// round-trip — one 'job' in, one 'done' / 'error' out.
// No compiled worker file (Jest runs the .ts sources) → renders in-process.
export interface JobSheetRenderJob { plan: JobSheetPlan; lang: PrintLang }
export type JobSheetToWorker = { type: 'job'; job: JobSheetRenderJob }
export type JobSheetToMain = { type: 'done'; bytes: Uint8Array } | { type: 'error'; message: string }

const WORKER_HEAP_MB = 512
const DEFAULT_WORKER = { file: path.join(__dirname, 'job-sheet-worker.js'), execArgv: [] as string[] }

const logger = new Logger('JobSheetRender')
let warnedNoWorker = false

export function renderJobSheetPdf(
  plan: JobSheetPlan,
  lang: PrintLang,
  worker = DEFAULT_WORKER,
  queueWaitMs = QUEUE_WAIT_MS,
): Promise<Uint8Array> {
  if (!fs.existsSync(worker.file)) {
    if (process.env.NODE_ENV === 'production' && !warnedNoWorker) {
      warnedNoWorker = true
      logger.warn(`${worker.file} missing — job sheets render on the request thread`)
    }
    return buildJobSheetPdf(plan, lang)
  }
  return slot(() => runWorker({ plan, lang }, worker), queueWaitMs)
}

function runWorker(job: JobSheetRenderJob, worker: typeof DEFAULT_WORKER) {
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
    const timer = setTimeout(() => finish(new Error(`Job sheets took longer than ${RENDER_TIMEOUT_MS / 1000}s and were stopped`)), RENDER_TIMEOUT_MS)

    w.on('message', (msg: JobSheetToMain) => {
      if (msg.type === 'done') return finish(null, msg.bytes)
      return finish(new Error(msg.message))
    })
    w.on('error', (err) => finish(err))
    w.on('messageerror', (err) => finish(err))
    w.on('exit', (code) => finish(new Error(`Job sheet worker stopped unexpectedly (exit ${code})`)))
    try {
      w.postMessage({ type: 'job', job } satisfies JobSheetToWorker)
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err))) // plan not cloneable → stop the worker now
    }
  })
}
