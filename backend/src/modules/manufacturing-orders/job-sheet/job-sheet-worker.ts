import { parentPort } from 'worker_threads'
import { buildJobSheetPdf } from './job-sheet-pdf-builder'
import type { JobSheetToMain, JobSheetToWorker } from './job-sheet-render'

// Worker-thread entry for per-piece job sheets — only the CPU-heavy layout runs
// here (same reason as mo-print-worker.ts: a few hundred pages of pdf-lib
// layout would otherwise block every other request on the instance).
const port = parentPort!

port.on('message', (msg: JobSheetToWorker) => {
  if (msg.type !== 'job') return
  buildJobSheetPdf(msg.job.plan, msg.job.lang).then(
    (bytes) => port.postMessage({ type: 'done', bytes } satisfies JobSheetToMain, [bytes.buffer as ArrayBuffer]),
    (err) => port.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies JobSheetToMain),
  )
})
