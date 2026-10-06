import type { PartLine, PartMark } from '../api/mo'

// Round 3 matching (wiki features/mo-part-import-plan §10.2): a Dispatch
// Note mark is an H of 3 plates — flange W × L ×2/set (thickness tf), web
// (H − 2·tf) × L ×1/set (thickness tw). tw/tf typed by the user, else read
// from the Material List row PLt×W / PLt×(H−2tf) at length L. Never guesses:
// no match → a reason, and the mark gets no plates. Runs live in the form.

export interface SizeComparison {
  profile: string
  grade: string
  length_mm: number
  from_marks: number
  from_list: number | null
  diff: number
}

const PLATE = /^PL(\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)$/
const sizeKey = (l: { profile: string; grade: string; length_mm: number }) =>
  `${l.profile.trim().toUpperCase()}|${l.grade.trim().toUpperCase()}|${Number(l.length_mm)}`

function platesAt(list: PartLine[], width: number, length: number) {
  return list.filter(r => {
    const m = PLATE.exec(r.profile.trim())
    return m && Number(m[2]) === width && Number(r.length_mm) === length
  }).map(r => ({ row: r, t: Number(PLATE.exec(r.profile.trim())![1]) }))
}

function pickThickness(list: PartLine[], mark: string, width: number, length: number, typed: number | null | undefined) {
  if (typed != null && typed > 0) {
    const row = platesAt(list, width, length).find(p => p.t === typed)?.row
    return { t: typed, row }
  }
  const found = platesAt(list, width, length)
  const ts = [...new Set(found.map(f => f.t))]
  if (ts.length === 0) return { reason: `${mark}: no PL…x${width} at length ${length} in the Material List — type tf/tw` }
  if (ts.length > 1) return { reason: `${mark}: several thicknesses for PL…x${width} at length ${length} — type tf/tw` }
  return { t: ts[0], row: found[0].row }
}

export function deriveMarkPlates(m: PartMark, list: PartLine[]): { lines: PartLine[]; tf: number; tw: number } | { reason: string } {
  const L = Number(m.length_mm), W = Number(m.width_mm), H = Number(m.height_mm)
  if (!(L > 0 && W > 0 && H > 0)) return { reason: `${m.mark}: length, width and height are needed` }
  if (!(Number(m.set_qty) > 0)) return { reason: `${m.mark}: set must be > 0` }

  const flange = pickThickness(list, m.mark, W, L, m.tf_mm)
  if ('reason' in flange) return { reason: flange.reason! }
  const webH = H - 2 * flange.t!
  if (!(webH > 0)) return { reason: `${m.mark}: height ${H} is too small for flange thickness ${flange.t}` }
  const web = pickThickness(list, m.mark, webH, L, m.tw_mm)
  if ('reason' in web) return { reason: web.reason! }

  const line = (t: number, w: number, qty: number, row?: PartLine): PartLine => ({
    mark: m.mark,
    profile: `PL${t}x${w}`,
    grade: row?.grade ?? '',
    length_mm: L,
    qty,
    unit_weight_kg: row?.unit_weight_kg ?? null,
  })
  return {
    tf: flange.t!,
    tw: web.t!,
    lines: [line(flange.t!, W, 2 * Number(m.set_qty), flange.row), line(web.t!, webH, Number(m.set_qty), web.row)],
  }
}

export function buildFromSources(marks: PartMark[], list: PartLine[]): { lines: PartLine[]; warnings: string[] } {
  const lines: PartLine[] = []
  const warnings: string[] = []
  for (const m of marks) {
    const r = deriveMarkPlates(m, list)
    if ('reason' in r) warnings.push(r.reason)
    else lines.push(...r.lines)
  }
  const derived = new Map<string, number>()
  for (const l of lines) derived.set(sizeKey(l), (derived.get(sizeKey(l)) ?? 0) + Number(l.qty))
  // Material List qty no mark explains stays as an unassigned line.
  for (const row of list) {
    const extra = Number(row.qty) - (derived.get(sizeKey(row)) ?? 0)
    if (extra > 0) lines.push({ ...row, mark: null, qty: extra })
  }
  return { lines, warnings }
}

export function compareSizes(lines: PartLine[], list: PartLine[] | null): SizeComparison[] {
  const rows = new Map<string, SizeComparison>()
  const at = (l: PartLine) => {
    const k = sizeKey(l)
    if (!rows.has(k)) rows.set(k, { profile: l.profile, grade: l.grade, length_mm: Number(l.length_mm), from_marks: 0, from_list: list ? 0 : null, diff: 0 })
    return rows.get(k)!
  }
  for (const l of lines) if (l.mark) at(l).from_marks += Number(l.qty) || 0
  for (const r of list ?? []) at(r).from_list = (at(r).from_list ?? 0) + (Number(r.qty) || 0)
  for (const c of rows.values()) c.diff = c.from_marks - (c.from_list ?? c.from_marks)
  return [...rows.values()]
}
