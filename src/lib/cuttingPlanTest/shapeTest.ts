import type { ShapeTestLayout, ShapeTestStock } from '../../api/cutting-plan-test'

// CP-Shape-Test (2026-11-11, wiki features/cp-shape-test.md)

// Boss's yield-loss scale: up to 3% great, over 7% bad
export type LossGrade = 'great' | 'ok' | 'bad'
export const yieldLossGrade = (lossPct: number): LossGrade => (lossPct <= 3 ? 'great' : lossPct <= 7 ? 'ok' : 'bad')

// Starting lengths (Tao 2026-11-11: plan what to buy, so no limits by default): the plan-stock lengths of the CutLogic
// run for 0X222 Driving Bangna NP zone 3 (17 Jun 2026); other sizes by family. That run's limits, to replay it with
// "Limit in stock": 101.6X2.4 9,500 × 32 · 101.6X2.6 12,500 × 12 · 113.5X2.4 9,500 × 64.
const PROTOTYPE_LENGTHS: Record<string, number[]> = {
  'PIPE 101.6X2.4': [9500, 6013],
  'PIPE 101.6X2.6': [12500, 6013],
  'PIPE 113.5X2.4': [9500, 6013],
  'PIPE 139.8X3.2': [12500],
  'PIPE 165.2X4.5': [12500],
  'PIPE 60.5X2.4': [6013],
}
export const STOCK_PRESETS = [6013, 9500, 10000, 12500]

// Laid out now: PIPE and ROD (the backend's profile-family.ts lists the shapes prepared for later)
export type Family = 'PIPE' | 'ROD' | 'OTHER'
export const familyOf = (profile: string): Family => (profile.startsWith('PIPE') ? 'PIPE' : profile.startsWith('ROD') ? 'ROD' : 'OTHER')
// Rods: 10,000 mm stock and kerf 10 mm, as in the "BIF all rod 25" CutLogic run (24 Jun 2026); pipes kerf 12 mm
const FAMILY_STOCK: Record<Family, number> = { PIPE: 6013, ROD: 10000, OTHER: 6013 }
export const defaultKerf = (profile: string) => (familyOf(profile) === 'ROD' ? 10 : 12)
export function defaultStock(profile: string, longestMm = 0): ShapeTestStock[] {
  const stock: ShapeTestStock[] = (PROTOTYPE_LENGTHS[profile] ?? [FAMILY_STOCK[familyOf(profile)]]).map(lengthMm => ({ lengthMm, qty: null }))
  if (longestMm > Math.max(...stock.map(s => s.lengthMm)) && longestMm <= 12500) stock.push({ lengthMm: 12500, qty: null })
  return stock
}

// nestedMm (saddle nesting): BOM length that tucked into other pieces; the yield counts what the parts take up on the bars
interface Totals { stocks: number; stockLengthMm: number; partsLengthMm: number; nestedMm?: number; scrapMm: number; cuts: number }
export function totals(results: Totals[]) {
  const t = results.reduce<Required<Totals>>((a, r) => ({
    stocks: a.stocks + r.stocks, stockLengthMm: a.stockLengthMm + r.stockLengthMm, partsLengthMm: a.partsLengthMm + r.partsLengthMm,
    nestedMm: a.nestedMm + (r.nestedMm ?? 0), scrapMm: a.scrapMm + r.scrapMm, cuts: a.cuts + r.cuts,
  }), { stocks: 0, stockLengthMm: 0, partsLengthMm: 0, nestedMm: 0, scrapMm: 0, cuts: 0 })
  const yieldPct = t.stockLengthMm ? ((t.partsLengthMm - t.nestedMm) / t.stockLengthMm) * 100 : 0
  return { ...t, yieldPct, lossPct: t.stockLengthMm ? 100 - yieldPct : 0 }
}

// One layout is one cutting pattern repeated; its marks are totals over the repeats (Tao 2026-11-12: show which marks
// one bar is cut into). Each bar takes, per piece in order, the next mark of that length, so a mark is used up before
// the next one starts; bars that come out the same are grouped (from–to, 1-based).
export function barGroups(layout: ShapeTestLayout): { from: number; to: number; marks: string[] }[] {
  const queue = new Map<number, string[]>()
  for (const m of layout.marks) queue.set(m.lengthMm, [...(queue.get(m.lengthMm) ?? []), ...Array<string>(m.pcs).fill(m.mark)])
  const groups: { from: number; to: number; marks: string[] }[] = []
  for (let bar = 1; bar <= layout.repeat; bar++) {
    const marks = layout.pieces.flatMap(p => Array.from({ length: p.count }, () => queue.get(p.lengthMm)?.shift() ?? '?'))
    const last = groups[groups.length - 1]
    if (last && last.marks.join('|') === marks.join('|')) last.to = bar
    else groups.push({ from: bar, to: bar, marks })
  }
  return groups
}

// One layout per set of marks (Tao 2026-11-12: "so users aren't confused"): a cut pattern whose bars carry different
// marks becomes one layout per group of identical bars. Steel, scrap and cuts don't change; `pattern` is the cut
// pattern it came from, so layouts with the same cuts can say so.
export function splitByMarkSet(layouts: ShapeTestLayout[]): { pattern: number; marks: string[]; layout: ShapeTestLayout }[] {
  return layouts.flatMap((l, pattern) => {
    const groups = barGroups(l)
    if (groups.length === 1) return [{ pattern, marks: groups[0].marks, layout: l }]
    const lens = l.pieces.flatMap(p => Array<number>(p.count).fill(p.lengthMm))
    return groups.map(g => {
      const bars = g.to - g.from + 1
      const marks: ShapeTestLayout['marks'] = []
      g.marks.forEach((mark, k) => {
        const m = marks.find(x => x.mark === mark && x.lengthMm === lens[k])
        if (m) m.pcs += bars
        else marks.push({ mark, lengthMm: lens[k], pcs: bars })
      })
      return { pattern, marks: g.marks, layout: { ...l, repeat: bars, marks } }
    })
  })
}

// One colour per length, in the layout's own piece order, so two lengths in one bar never share one (a size-wide
// palette wrapped after 10 lengths). The bar and its 3D both colour from here (Tao 2026-11-13: they disagreed).
const PALETTE = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#65A30D', '#DB2777', '#4F46E5', '#CA8A04']
export const pieceColors = (layout: ShapeTestLayout) => (lengthMm: number) => PALETTE[Math.max(0, layout.pieces.findIndex(p => p.lengthMm === lengthMm)) % PALETTE.length]

// Where each piece sits on the bar: from the bar's start, one kerf between pieces, less the joint's nest when saddle
// nesting is on (layout.nestMm, joint by joint)
export function barPieces(layout: ShapeTestLayout, marks: string[], kerfMm: number) {
  let at = 0, n = 0
  return layout.pieces.flatMap(p => Array.from({ length: p.count }, () => {
    if (n > 0) at -= layout.nestMm?.[n - 1] ?? 0
    const piece = { n: n + 1, mark: marks[n] ?? '?', lengthMm: p.lengthMm, fromMm: at, toMm: at + p.lengthMm }
    at += p.lengthMm + kerfMm; n++
    return piece
  }))
}

// Saddle nesting (POC 2026-11-12): how far round to turn the next piece so its left end tucks best into the previous
// piece's right end, a kerf apart — the backend's pairSaving (saddle.ts), same 5° steps, so the gain is at least the
// credit the layout used
type Grids = { LW: number[]; LN: number[]; RW: number[]; RN: number[] }
const lines = (g: Grids) => {
  const xL = g.LW.map((v, i) => Math.max(v, g.LN[i])), xR = g.RW.map((v, i) => Math.min(v, g.RN[i]))
  const tip = Math.min(...xL)
  return { xL: xL.map(v => v - tip), xR: xR.map(v => v - tip) }
}
export function nestTurn(prev: Grids, next: Grids, kerfMm: number) {
  const a = lines(prev), b = lines(next), tipA = Math.max(...a.xR)
  let best = { saving: 0, turn: 0 }
  for (let turn = 0; turn < 360; turn += 5) {
    let start = -Infinity
    for (let i = 0; i < 360; i++) start = Math.max(start, a.xR[i] - tipA + kerfMm - b.xL[(i + turn) % 360])
    if (kerfMm - start > best.saving + 1e-9) best = { saving: kerfMm - start, turn }
  }
  return best.turn
}

// "PIPE 60.5X2.4" → outer 60.5, wall 2.4; "ROD RB25" → solid 25
export function pipeSection(profile: string): { outerMm: number; wallMm: number | null } {
  const pipe = /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/.exec(profile)
  if (pipe && familyOf(profile) === 'PIPE') return { outerMm: Number(pipe[1]), wallMm: Number(pipe[2]) }
  const d = /(\d+(?:\.\d+)?)/.exec(profile)
  return { outerMm: d ? Number(d[1]) : 50, wallMm: null }
}
