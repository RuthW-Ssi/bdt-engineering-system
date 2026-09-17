import type { PDFFont } from 'pdf-lib'

// Every quantity/time value on the print packet displays to a fixed 2
// decimal places — mixing whole numbers and varying-precision decimals in
// the same column reads as inconsistent on a printed factory form.
export function fmt2(n: number): string {
  return n.toFixed(2)
}

// Largest font size (up to `size`) at which `text` fits `maxWidth`, floored
// at `minSize` — keeps a long value (e.g. a Thai project name) inside its
// cell on the one-page WO traveler instead of spilling into the next one.
export function fitTextSize(font: PDFFont, text: string, maxWidth: number, size: number, minSize = 6): number {
  const widthAt1pt = font.widthOfTextAtSize(text, 1)
  if (widthAt1pt === 0) return size
  return Math.max(minSize, Math.min(size, maxWidth / widthAt1pt))
}

// Fits a list into a fixed number of table rows on the one-page WO
// traveler. When it's too long, the last row is given up to a "+N more"
// pointer (so `hiddenCount` counts that row's item too) rather than items
// silently disappearing.
export function capList<T>(items: T[], capacity: number): { shown: T[]; hiddenCount: number } {
  if (items.length <= capacity) return { shown: items, hiddenCount: 0 }
  const shown = items.slice(0, Math.max(0, capacity - 1))
  return { shown, hiddenCount: items.length - shown.length }
}

// Sizes a list table (header row + `capacity` body rows) to exactly fill a
// fixed-height slot on the one-page WO traveler. A short list gets the
// preferred row height with blank hand-fill rows below it; a longer one
// shrinks its rows (never below `minRowHeight`) to show every item; beyond
// that, capacity stops growing and the caller caps the list (capList).
export function fitTableRows(slotHeight: number, itemCount: number, preferredRowHeight: number, minRowHeight: number): { capacity: number; rowHeight: number } {
  const preferredCapacity = Math.floor(slotHeight / preferredRowHeight) - 1
  const maxCapacity = Math.floor(slotHeight / minRowHeight) - 1
  const capacity = Math.min(Math.max(itemCount, preferredCapacity), maxCapacity)
  return { capacity, rowHeight: slotHeight / (capacity + 1) }
}

// Plan Start/Finish on the WO traveler — shop-floor local time, not the
// server's zone (Cloud Run runs in UTC). Blank for an unscheduled WO, so
// the cell stays free for hand-fill (2026-09-16).
export function formatPlanDateTime(d: Date | null): string {
  if (!d) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map(p => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

// MO page Routing checklist: one row per routing operation (by sequence),
// collecting the codes of every WO that operation currently has — one per
// mark today (2026-09-16).
export interface OperationSummary {
  sequence: number
  operationLabel: string | null
  workCenterName: string
  woCodes: string[]
}

export function summarizeOperations(
  wos: { sequence: number; operationLabel: string | null; workCenterName: string; woCode: string }[],
): OperationSummary[] {
  const bySequence = new Map<number, OperationSummary>()
  for (const wo of wos) {
    const op = bySequence.get(wo.sequence)
    if (op) op.woCodes.push(wo.woCode)
    else bySequence.set(wo.sequence, { sequence: wo.sequence, operationLabel: wo.operationLabel, workCenterName: wo.workCenterName, woCodes: [wo.woCode] })
  }
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence)
}

// "WO-00000079" for one WO, "WO-00000079 +8" for nine — keeps the Routing
// checklist's WO cell to one line.
export function formatWoCodes(codes: string[]): string {
  if (codes.length === 0) return '—'
  return codes.length === 1 ? codes[0] : `${codes[0]} +${codes.length - 1}`
}

// Feeds the PDF's own /Title metadata — the packet is opened via a blob:
// URL in a new browser tab (MoDetail.tsx's handlePrint), not downloaded
// directly, so a Content-Disposition header has no effect on what a
// browser suggests as the filename when a user hits Save; the PDF's
// embedded Title is what browsers' native PDF viewers actually use for
// that (2026-09-16).
export function formatPrintPacketTitle(moCode: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${moCode}-${date}-${time}`
}
