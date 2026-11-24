// "ใบงานต่อชิ้น" (per-piece job sheet) — pure helpers, no I/O, so every
// rule here is unit-testable without Prisma or pdf-lib (same split as
// mo-print/mo-print-format.ts).
//
// DRAFT: the sheet's content/layout affects shop-floor
// quality records — it needs a QA / production sign-off before it replaces
// any controlled form.

export type JobSheetMode = 'piece' | 'part'

// One sheet per physical piece ("piece", default — the sheet travels with the
// piece) or one sheet per part mark carrying its quantity ("part" — cheaper
// on paper for long runs of identical pieces).
export function parseJobSheetMode(raw: string | undefined): JobSheetMode {
  return raw === 'part' ? 'part' : 'piece'
}

// "1,2, 3" → [1, 2, 3]; undefined stays undefined (= no filter), '' → []
// (explicitly nothing) — same contract as the print packet's `wo_ids`.
export function parseIdList(raw: string | undefined): number[] | undefined {
  if (raw === undefined) return undefined
  return raw.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0)
}

export function parseMarkList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

export function parseOptionalId(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export interface JobSheetHoleGroup {
  diameter_mm: number
  count: number
}

// Accepts the hole shapes used in this codebase and in the canonical part
// JSON format, and folds them into "N holes of diameter D" groups:
//   - nc-parser / mo_part_line.holes:  [{ diameter_mm, count }]
//   - canonical part JSON:             [{ type: 'round', cx, cy, d }]
// Anything else (null, a string, slots with no diameter) is ignored — the
// sheet then prints "no hole data" instead of a wrong number.
export function parseHoleGroups(raw: unknown): JobSheetHoleGroup[] {
  if (!Array.isArray(raw)) return []
  const byDia = new Map<number, number>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const h = item as Record<string, unknown>
    const dia = Number(h.diameter_mm ?? h.d ?? h.diameter)
    if (!Number.isFinite(dia) || dia <= 0) continue
    const count = h.count === undefined ? 1 : Number(h.count)
    if (!Number.isFinite(count) || count <= 0) continue
    const key = Math.round(dia * 100) / 100
    byDia.set(key, (byDia.get(key) ?? 0) + Math.round(count))
  }
  return [...byDia.entries()].sort((a, b) => a[0] - b[0]).map(([diameter_mm, count]) => ({ diameter_mm, count }))
}

export function totalHoles(groups: JobSheetHoleGroup[]): number {
  return groups.reduce((s, g) => s + g.count, 0)
}

const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''))

// "4 x D22, 2 x D18" — plain ASCII on purpose: the diameter sign is not in
// every subset of the embedded font, and the floor reads "D22" fine.
export function formatHoleSummary(groups: JobSheetHoleGroup[]): string {
  if (groups.length === 0) return ''
  return groups.map(g => `${g.count} x D${trimNum(g.diameter_mm)}`).join(', ')
}

export function fmtMm(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '' : `${trimNum(Math.round(n * 100) / 100)} mm`
}

export function fmtKg(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '' : `${n.toFixed(2)} kg`
}

// dd/mm/yyyy in Asia/Bangkok (the plant's time zone), never server UTC —
// a due date printed one day early/late is worse than none.
export function fmtJobSheetDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

// Stable human-readable id of one physical piece, printed under the QR and
// carried in the QR's query string. NOT a database key — pieces are not
// rows yet (plate heat traceability will decide whether they become rows).
export function pieceId(moCode: string, assemblyMark: string, partMark: string, pieceNo: number | null, pieceTotal: number): string {
  const base = `${moCode}/${assemblyMark}/${partMark}`
  if (pieceNo == null) return `${base}/x${pieceTotal}`
  const width = Math.max(2, String(pieceTotal).length)
  return `${base}/${String(pieceNo).padStart(width, '0')}-${String(pieceTotal).padStart(width, '0')}`
}

// Save-as name comes from the PDF Title (the file opens from a blob: URL, so
// Content-Disposition is ignored — same reason as formatPrintPacketTitle).
export function formatJobSheetTitle(moCode: string, now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce<Record<string, string>>((acc, x) => { acc[x.type] = x.value; return acc }, {})
  return `JOBSHEET-${moCode}-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`
}

// Expands one part row into the sheets it prints as. Fractional / zero /
// negative quantities (bad BOM data) fall back to a single sheet so a part
// never silently disappears from the batch.
export function expandPieces(qty: number, mode: JobSheetMode): { pieceNo: number | null; pieceTotal: number }[] {
  const total = Number.isFinite(qty) && qty >= 1 ? Math.round(qty) : 1
  if (mode === 'part') return [{ pieceNo: null, pieceTotal: total }]
  return Array.from({ length: total }, (_, i) => ({ pieceNo: i + 1, pieceTotal: total }))
}

// How many sheets a set of part rows would print, without building them —
// lets the service refuse an oversized batch before any layout work.
export function countSheets(qtys: number[], mode: JobSheetMode): number {
  if (mode === 'part') return qtys.length
  return qtys.reduce((s, q) => s + (Number.isFinite(q) && q >= 1 ? Math.round(q) : 1), 0)
}

// Shrinks a font size until `text` fits `maxWidth` (never below `min`), then
// hard-truncates with an ellipsis. `measure` is pdf-lib's
// font.widthOfTextAtSize, injected so this stays testable.
export function fitText(text: string, maxWidth: number, size: number, min: number, measure: (t: string, s: number) => number): { text: string; size: number } {
  let s = size
  while (s > min && measure(text, s) > maxWidth) s -= 0.5
  if (measure(text, s) <= maxWidth) return { text, size: s }
  let t = text
  while (t.length > 1 && measure(`${t}...`, s) > maxWidth) t = t.slice(0, -1)
  return { text: `${t}...`, size: s }
}

// Best-effort thickness/width from a plate or flat-bar profile string
// ("PL12", "PL12x200", "FB 9 x 75") — bom_part stores only profile + length.
// Only the PL / FB prefixes are read; anything else (H, C, L, PIPE …) returns
// nulls and the sheet leaves those boxes blank rather than guessing.
// ASSUMPTION (unverified against the full BOM history): the first number is
// the thickness and the second the width, as in the plant's part lists.
export function parsePlateProfile(profile: string | null | undefined): { thickness_mm: number | null; width_mm: number | null } {
  const m = /^\s*(?:PL|FB)\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/i.exec(profile ?? '')
  if (!m) return { thickness_mm: null, width_mm: null }
  return { thickness_mm: Number(m[1]), width_mm: m[2] !== undefined ? Number(m[2]) : null }
}
