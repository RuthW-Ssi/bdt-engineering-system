import type { ShapeTestLayout, ShapeTestPartList, ShapeTestStock } from '../../api/cutting-plan-test'

// CP-Shape-Test (2026-11-11, wiki features/cp-shape-test.md)

// Yield-loss scale: up to 3% great, over 5% bad (Tao 2026-11-17; the boss's first scale said over 7%)
export type LossGrade = 'great' | 'ok' | 'bad'
export const yieldLossGrade = (lossPct: number): LossGrade => (lossPct <= 3 ? 'great' : lossPct <= 5 ? 'ok' : 'bad')

// Starting lengths (Tao 2026-11-16, replaces the 0X222 prototype lengths and the 6,013 every other size got): only what
// the factory has confirmed. SS400 = 6,000 mm, whatever the shape; deformed and round bars (DB, RB) = 10,000 mm; any
// other size starts empty and the user enters its lengths. No stock length over 12,500 mm (the backend refuses it too).
export const MAX_STOCK_MM = 12500
export const STOCK_PRESETS = [6000, 6013, 9500, 10000, 12500]

// Laid out now: PIPE, ROD, BOX, L, C, H (the backend's profile-family.ts names them so: "BOX 100X50X2.3", "L 50X50X5",
// "C 150X75X6.5X10", "H 200X100X5.5X8")
export type Family = 'PIPE' | 'ROD' | 'BOX' | 'L' | 'C' | 'H' | 'OTHER'
const FAMILIES: Family[] = ['PIPE', 'ROD', 'BOX', 'L', 'C', 'H']
export const familyOf = (profile: string): Family => {
  const f = profile.split(' ')[0] as Family
  return FAMILIES.includes(f) ? f : 'OTHER'
}
// Sizes grouped by type, as the CutLogic runs were (one run per type: "all pipe zone 3", "all rod 25") — each type
// goes to its own machine, so the screen and the cutting report split there (Tao 2026-11-26)
export const FAMILY_ORDER: Family[] = [...FAMILIES, 'OTHER']
export const FAMILY_LABEL: Record<Family, string> = { PIPE: 'Pipe', ROD: 'Rod', BOX: 'Box', L: 'Angle (L)', C: 'Channel (C)', H: 'H-beam', OTHER: 'Other' }
export function groupByFamily<T extends { profile: string }>(sizes: T[]): { family: Family; sizes: T[] }[] {
  return FAMILY_ORDER.map(family => ({ family, sizes: sizes.filter(s => familyOf(s.profile) === family) })).filter(g => g.sizes.length)
}
// Only pipes have end cuts in the model (BdtPipeCut): cut lengths, saddle nesting and the 3D ends are pipe-only
export const isSleeveSize = (profile: string) => / SL$/.test(profile)
export const usesEndCuts = (profile: string) => familyOf(profile) === 'PIPE' && !isSleeveSize(profile)

// Sleeve pipes (…SL) as their own size "<pipe> SL" (Tao 2026-11-26: the user picks own size or with their pipe). The
// models draw a sleeve as an inner sleeve, its outside = its pipe's inside (139.8X5 SL is 129.8 across), so own size is
// where the screen starts. The backend sends them inside their pipe's size, each part flagged.
export function splitSleeves(list: ShapeTestPartList): ShapeTestPartList {
  if (!list.sizes.some(s => s.parts.some(p => p.sleeve))) return list
  const sizes = list.sizes.flatMap(s => {
    const sl = s.parts.filter(p => p.sleeve), rest = s.parts.filter(p => !p.sleeve)
    if (!sl.length) return [s]
    const own = { ...s, profile: `${s.profile} SL`, parts: sl, kgPerM: null } // its own section, not the pipe's weight
    return rest.length ? [{ ...s, parts: rest }, own] : [own]
  })
  return { ...list, sizes, warnings: list.warnings.map(w => w.replace('sleeve pipes (SL) laid out with it', 'sleeve pipes (SL) laid out as their own size')) }
}
// Rods: kerf 10 mm, as in the "BIF all rod 25" CutLogic run (24 Jun 2026); pipes kerf 12 mm, BOX and L too until the
// factory gives the kerf of the machine that cuts them
export const defaultKerf = (profile: string) => (familyOf(profile) === 'ROD' ? 10 : 12)
const isBar = (profile: string) => /^(ROD)?(DB|RB)\d/.test(profile.toUpperCase().replace(/\s+/g, ''))
export function defaultStock(profile: string, grade?: string | null): ShapeTestStock[] {
  const lengthMm = isBar(profile) ? 10000 : grade?.trim().toUpperCase() === 'SS400' ? 6000 : null
  return lengthMm ? [{ lengthMm, qty: null }] : []
}
// Why a size cannot be laid out yet (it is skipped by a run), or null
// longestMm: the size's longest piece, said before the run when no stock length holds it (2026-11-26: BOX 200 got the
// SS400 6,000 for an 8,521 mm piece and only failed after Run)
// User test report 2026-11-26 §5: HSS550 / HSS500 pipe is ordered cut to length, up to 12,500 mm, no more than 3 lengths
// per size. Other grades: the 6 the backend takes.
export const maxStockLengths = (grade?: string | null) => (/^HSS5[05]0$/.test(grade?.trim().toUpperCase() ?? '') ? 3 : 6)
export function stockProblem(stock: ShapeTestStock[], longestMm?: number, maxLengths = 6): string | null {
  if (!stock.length) return 'Enter a stock length'
  if (stock.length > maxLengths) return `At most ${maxLengths} stock lengths for this grade`
  if (stock.some(s => !(s.lengthMm >= 100 && s.lengthMm <= MAX_STOCK_MM))) return `Stock lengths are 100 to ${MAX_STOCK_MM.toLocaleString('en-US')} mm`
  if (longestMm != null && stock.every(s => s.lengthMm < longestMm)) return `Longest piece ${longestMm.toLocaleString('en-US', { maximumFractionDigits: 2 })} mm: add a longer stock length`
  return null
}

// nestedMm (saddle nesting): BOM length that tucked into other pieces; the yield counts what the parts take up on the bars
interface Totals { stocks: number; stockLengthMm: number; partsLengthMm: number; nestedMm?: number; scrapMm: number; cuts: number }
// Pieces on the bars: every piece of every repeat (2026-11-26 user report read the Cuts total, 400, as the pieces out of
// 410 in — a piece that fills the bar or ends at its end needs no cut)
export const piecesLaidOut = (r: { layouts: ShapeTestLayout[] }) =>
  r.layouts.reduce((n, l) => n + l.repeat * l.pieces.reduce((a, p) => a + p.count, 0), 0)

// Where the stock goes (user report 2026-11-26 §3, Tao: "ตามนั้นเลย"): parts, remnants (offcuts at least minRemnantMm long,
// kept for later) and loss (kerf + shorter offcuts). Kerf is what is left once parts and offcuts are taken out, so the
// three always add up to the stock, nested layouts included (parts count the steel they take, not their BOM length).
export interface Balance { stockMm: number; partsMm: number; offcutMm: number; kerfMm: number; remnantMm: number; lossMm: number; lossPct: number; remnants: { lengthMm: number; pcs: number }[] }
export function materialBalance(r: { stockLengthMm: number; partsLengthMm: number; nestedMm?: number; layouts: ShapeTestLayout[] }, minRemnantMm: number | null): Balance {
  const partsMm = r.partsLengthMm - (r.nestedMm ?? 0)
  const byLength = new Map<number, number>()
  let offcutMm = 0, remnantMm = 0
  for (const l of r.layouts) {
    if (l.restMm <= 0) continue
    if (minRemnantMm != null && minRemnantMm > 0 && l.restMm >= minRemnantMm) {
      remnantMm += l.restMm * l.repeat
      byLength.set(l.restMm, (byLength.get(l.restMm) ?? 0) + l.repeat)
    } else offcutMm += l.restMm * l.repeat
  }
  const kerfMm = Math.max(0, r.stockLengthMm - partsMm - offcutMm - remnantMm)
  const lossMm = r.stockLengthMm - partsMm - remnantMm
  return {
    stockMm: r.stockLengthMm, partsMm, offcutMm, kerfMm, remnantMm, lossMm, lossPct: r.stockLengthMm ? (lossMm / r.stockLengthMm) * 100 : 0,
    remnants: [...byLength].sort((a, b) => b[0] - a[0]).map(([lengthMm, pcs]) => ({ lengthMm, pcs })),
  }
}

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

// The cross-section the 3D draws. "PIPE 60.5X2.4" → round, wall 2.4; "ROD RB25" → round, solid; "BOX 100X50X2.3" →
// box h 100 × b 50, wall 2.3 ("BOX 100X3.2" = square); "L 100X75X7" → angle, legs 100 and 75, 7 thick ("L 65X6" = equal)
export type Section =
  | { kind: 'round'; outerMm: number; wallMm: number | null }
  | { kind: 'box'; heightMm: number; widthMm: number; wallMm: number }
  | { kind: 'angle'; legAMm: number; legBMm: number; thickMm: number }
  | { kind: 'h' | 'channel'; heightMm: number; widthMm: number; webMm: number; flangeMm: number }
export function section(profile: string): Section {
  const n = (profile.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  const fam = familyOf(profile)
  // "H 200X100X5.5X8" / "C 150X75X6.5X10": height × width × web × flange; "C 100X50X5" one thickness for both; with
  // only H × B the thicknesses are a guess for the picture (the layout never uses them)
  if ((fam === 'H' || fam === 'C') && n.length >= 2) {
    const [h, b] = n
    const web = n[2] ?? Math.max(3, h / 35), flange = n[3] ?? n[2] ?? Math.max(4, h / 25)
    return { kind: fam === 'H' ? 'h' : 'channel', heightMm: h, widthMm: b, webMm: Math.min(web, b - 0.5), flangeMm: Math.min(flange, h / 2 - 0.5) }
  }
  if ((fam === 'BOX' || fam === 'L') && n.length >= 2) {
    const [a, b, t] = n.length >= 3 ? n : [n[0], n[0], n[1]]
    // a wall too thick for the size would turn the outline inside out: keep it inside
    if (fam === 'BOX') return { kind: 'box', heightMm: a, widthMm: b, wallMm: Math.min(t, Math.min(a, b) / 2 - 0.5) }
    return { kind: 'angle', legAMm: a, legBMm: b, thickMm: Math.min(t, Math.min(a, b) - 0.5) }
  }
  // a sleeve size: the tube that fits inside its pipe (outside = the pipe's inside), same wall
  if (fam === 'PIPE' && n.length >= 2 && isSleeveSize(profile)) return { kind: 'round', outerMm: Math.round((n[0] - 2 * n[1]) * 100) / 100, wallMm: n[1] }
  if (fam === 'PIPE' && n.length >= 2) return { kind: 'round', outerMm: n[0], wallMm: n[1] }
  return { kind: 'round', outerMm: n[0] ?? 50, wallMm: null }
}
// The section's largest side, to frame the camera and size the cut marks
export const sectionExtent = (s: Section) => (s.kind === 'round' ? s.outerMm : s.kind === 'angle' ? Math.max(s.legAMm, s.legBMm) : Math.max(s.heightMm, s.widthMm))

// The prefix every mark of a layout shares (up to its last "-", e.g. DBN-B2-), said once above the layout
export function sharedPrefix(marks: string[]) {
  if (!marks.length) return ''
  let p = marks[0]
  for (const m of marks) while (!m.startsWith(p)) p = p.slice(0, -1)
  return p.slice(0, p.lastIndexOf('-') + 1)
}

// kg per metre (user report 2026-11-26: weight per profile): the size's own value (BOM / part list weight per piece ÷
// length, Tekla's, corner radii in), else its section area × 7.85 g/cm³ (no corner radii: a few % off)
export function sectionAreaMm2(s: Section): number {
  if (s.kind === 'round') { const ri = s.wallMm == null ? 0 : Math.max(0, s.outerMm / 2 - s.wallMm); return Math.PI * ((s.outerMm / 2) ** 2 - ri ** 2) }
  if (s.kind === 'box') return s.heightMm * s.widthMm - Math.max(0, s.heightMm - 2 * s.wallMm) * Math.max(0, s.widthMm - 2 * s.wallMm)
  if (s.kind === 'angle') return s.thickMm * (s.legAMm + s.legBMm - s.thickMm)
  return 2 * s.widthMm * s.flangeMm + (s.heightMm - 2 * s.flangeMm) * s.webMm
}
export const kgPerMetre = (size: { profile: string; kgPerM?: number | null }) => size.kgPerM ?? Math.round(sectionAreaMm2(section(size.profile)) * 0.00785 * 1000) / 1000
