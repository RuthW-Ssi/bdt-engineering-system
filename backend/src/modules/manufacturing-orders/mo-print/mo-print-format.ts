import type { PDFFont } from 'pdf-lib'

// Every quantity/time value on the print packet displays to a fixed 2
// decimal places — mixing whole numbers and varying-precision decimals in
// the same column reads as inconsistent on a printed factory form.
export function fmt2(n: number): string {
  return n.toFixed(2)
}

// Whole-number display (2026-09-21) — the WO traveler's own quantities/
// durations/weights round to the nearest whole unit rather than fmt2's fixed
// 2 decimals (matches Consume's qty already being a plain Int).
export function fmt0(n: number): string {
  return String(Math.round(n))
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

// Drawing version stamp + the traveler's "updated after this WO" note
// (2026-10-05, print option A) — dd/mm/yy in shop-floor time, same reason
// as formatPlanDateTime above.
export function formatShortDate(d: Date | string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: '2-digit', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(d)).map(p => [p.type, p.value]),
  )
  return `${parts.day}/${parts.month}/${parts.year}`
}

/** Marks whose printed drawing was uploaded after the WO was created —
 *  "CTR10 v3 (02/10/26)" each — so the floor knows the sheet changed since
 *  the job was issued. Upload date vs WO creation, no stored WO↔drawing link. */
export function drawingsUpdatedAfter(
  woCreatedAt: Date | string,
  marks: { assemblyMark: string; drawing: { version: number; uploaded_at: Date | string } }[],
): string[] {
  const created = new Date(woCreatedAt).getTime()
  return marks
    .filter(m => new Date(m.drawing.uploaded_at).getTime() > created)
    .map(m => `${m.assemblyMark} v${m.drawing.version} (${formatShortDate(m.drawing.uploaded_at)})`)
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
