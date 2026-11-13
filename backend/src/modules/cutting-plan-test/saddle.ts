import type { EndCut } from './end-cuts'
import type { ShapePart } from './shape-optimizer'

// CP-Shape-Test POC (Tao 2026-11-12): two layout options from the real end cuts (end-cuts.ts).
// - Saddle nesting: two saddle ends side by side can tuck into each other (the next piece turned round the axis), so
//   it starts earlier than tip-to-tip; the gap at the closest point stays one kerf. The optimizer works on lengths,
//   not on which piece sits next to which, so each length gets a safe credit: the least any of its saddle marks gains
//   after any saddle mark of the size (the shape-optimizer then lets the first piece of a chain take none).
// Lengths come in as the service set them: BdtPipeCut's cut length for marks in the model (Tao 2026-11-12, replacing the
// earlier "BOM lengths" rule — BdtPipeCut's NC runs tip to tip of the model's end cuts); nesting never changes them.
// The factory's pipe cutter is a Starfire CNC on plasma with a rotary axis (Tao's photos 2026-11-12): any end curve
// can be cut; whether it cuts nested ends in one run is still to confirm.

export interface Lines { xL: number[]; xR: number[] } // cut position at each degree, the piece's tip at 0
export const endLines = (c: EndCut): Lines => {
  const g = c.grids
  const xL = g.LW.map((v, i) => Math.max(v, g.LN[i])), xR = g.RW.map((v, i) => Math.min(v, g.RN[i]))
  const tip = Math.min(...xL)
  return { xL: xL.map(v => v - tip), xR: xR.map(v => v - tip) }
}
const lengthOf = (l: Lines) => Math.max(...l.xR)
const isSaddle = (c: EndCut | null | undefined) => !!c && c.L === 'saddle' && c.R === 'saddle'
const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** How much earlier B can start after A than tip-to-tip + kerf, B turned by turnDeg (5° steps), a kerf apart everywhere */
export function pairSaving(a: Lines, b: Lines, kerfMm: number, stepDeg = 5) {
  const tipA = lengthOf(a)
  let best = { savingMm: 0, turnDeg: 0 }
  for (let turn = 0; turn < 360; turn += stepDeg) {
    let start = -Infinity // B's tip, relative to A's tip, so that B clears A by a kerf at every angle
    for (let i = 0; i < 360; i++) start = Math.max(start, a.xR[i] - tipA + kerfMm - b.xL[(i + turn) % 360])
    const saving = kerfMm - start
    if (saving > best.savingMm + 1e-9) best = { savingMm: saving, turnDeg: turn }
  }
  return best
}

export function prepareSaddles(parts: ShapePart[], ends: Record<string, EndCut | null>, kerfMm: number) {
  const notes: string[] = []
  const lines = new Map<string, Lines>()
  for (const p of parts) { const c = ends[p.mark]; if (c && (c.L === 'saddle' || c.R === 'saddle')) lines.set(p.mark, endLines(c)) }

  const out = parts

  const creditMm = new Map<number, number>()
  {
    const saddles = out.filter(p => isSaddle(ends[p.mark]))
    const gain = new Map<string, number>()
    for (const b of saddles) {
      let least = Infinity
      for (const a of saddles) least = Math.min(least, pairSaving(lines.get(a.mark)!, lines.get(b.mark)!, kerfMm).savingMm)
      gain.set(b.mark, Math.max(0, Math.floor(least * 10 + 1e-6) / 10)) // 0.1 mm down, past float noise
    }
    for (const len of new Set(out.map(p => p.lengthMm))) {
      const same = out.filter(p => p.lengthMm === len)
      if (!same.every(p => gain.has(p.mark))) continue
      const c = Math.min(...same.map(p => gain.get(p.mark)!))
      if (c > 0) creditMm.set(len, c)
    }
    const lengths = new Set(out.map(p => p.lengthMm)).size
    const pcs = out.reduce((n, p) => n + p.count, 0), nestPcs = out.filter(p => creditMm.has(p.lengthMm)).reduce((n, p) => n + p.count, 0)
    notes.push(`Saddle nesting: ${creditMm.size} of ${lengths} lengths (${nestPcs} of ${pcs} pcs) can nest${creditMm.size ? `, up to ${mm(Math.max(...creditMm.values()))} mm per joint` : ''}`)
  }
  const missing = parts.filter(p => !ends[p.mark]).map(p => p.mark)
  if (missing.length) notes.push(`Not in the model, laid out as before: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`)
  return { parts: out, creditMm, notes }
}
