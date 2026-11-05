import { parentPort } from 'worker_threads'
import { buildMoPrintPdf } from './mo-print-pdf-builder'
import type { RenderJob, ToMain, ToWorker } from './mo-print-render'

// Worker-thread entry for the print packet (2026-11-05 load test: laying out
// and merging a big packet is ~seconds of pure CPU, which froze every other
// request on the same Cloud Run instance). Only the layout runs here; each
// drawing's bytes are asked for from the main thread, which owns file storage
// — one sheet at a time, so memory stays what it was in-process.
const port = parentPort!
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>()
let nextId = 0

port.on('message', (msg: ToWorker) => {
  if (msg.type === 'job') return void render(msg.job)
  const waiter = pending.get(msg.id)
  if (!waiter) return
  pending.delete(msg.id)
  if (msg.type === 'bytes') waiter.resolve(msg.bytes)
  else waiter.reject(new Error(msg.message))
})

async function render(job: RenderJob) {
  try {
    const bytes = await buildMoPrintPdf(
      job.plan,
      (row, mark, sheet) => {
        // The builder hands back the very objects of this (cloned) plan, so
        // their positions identify the sheet for the main thread's copy.
        const r = job.plan.rows.indexOf(row)
        const m = row.marks.indexOf(mark)
        const s = mark.drawings.indexOf(sheet)
        const id = nextId++
        return new Promise<Uint8Array>((resolve, reject) => {
          pending.set(id, { resolve, reject })
          port.postMessage({ type: 'fetch', id, r, m, s } satisfies ToMain)
        })
      },
      job.includeManifest,
      job.lang,
    )
    port.postMessage({ type: 'done', bytes } satisfies ToMain, [bytes.buffer as ArrayBuffer])
  } catch (err) {
    port.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies ToMain)
  }
}
