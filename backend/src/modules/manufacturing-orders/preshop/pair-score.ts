import type { PreshopPart } from './preshop-pdf-parser'

export type PartPairHow = 'name' | 'rename' | 'spec' | 'none'
const spec = (p: PreshopPart) => `${p.profile.trim()}|${p.length_mm}|${p.qty}`

/** Pairs one assembly's parts with another version's (2026-10-09; part renames
 *  2026-10-21): same part mark first, then a part rename the user confirmed on
 *  the BOM page, then the same spec (profile + L + count per set). */
export function pairPartsWithRenames(was: PreshopPart[], now: PreshopPart[], renamedTo: (mark: string) => string): { from: string; to: string | null; how: PartPairHow }[] {
  const free = new Map(now.map(p => [p.part_mark, p]))
  const out = new Map<string, { from: string; to: string | null; how: PartPairHow }>()
  for (const p of was) if (free.has(p.part_mark)) { out.set(p.part_mark, { from: p.part_mark, to: p.part_mark, how: 'name' }); free.delete(p.part_mark) }
  for (const p of was) {
    if (out.has(p.part_mark)) continue
    const t = renamedTo(p.part_mark)
    if (t !== p.part_mark && free.has(t)) { out.set(p.part_mark, { from: p.part_mark, to: t, how: 'rename' }); free.delete(t) }
  }
  for (const p of was) {
    if (out.has(p.part_mark)) continue
    const hit = [...free.values()].find(q => spec(q) === spec(p))
    if (hit) { out.set(p.part_mark, { from: p.part_mark, to: hit.part_mark, how: 'spec' }); free.delete(hit.part_mark) }
    else out.set(p.part_mark, { from: p.part_mark, to: null, how: 'none' })
  }
  return was.map(p => out.get(p.part_mark)!)
}

export const pairParts = (was: PreshopPart[], now: PreshopPart[]) => pairPartsWithRenames(was, now, m => m)

const stripLeadingDigits = (m: string) => m.replace(/^[0-9]+/, '')

/** Mark-only similarity for a pre-shop upload pairing suggestion (2026-10-22,
 *  [[preshop-mark-rename-plan]]): after upper-casing and stripping non-
 *  alphanumerics, one mark contains the other, or they are equal once their
 *  leading floor/prefix digits are stripped (`2BUH1B-4` ~ `9BUH1B-4` ~
 *  `BUH1B-4`). A suggestion only — the user confirms. */
export function nameSimilar(markA: string, markB: string): boolean {
  const norm = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const a = norm(markA), b = norm(markB)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const sa = stripLeadingDigits(a), sb = stripLeadingDigits(b)
  return sa.length > 0 && sa === sb
}

/** How likely two assemblies are the same piece under different marks, 0–100:
 *  parts with the same spec 60, same L 15, kg/set within 2 % 15, one mark
 *  containing the other 10. A suggestion only — the user confirms. */
export function pairScore(
  wasMark: string, was: { length_mm: number | null; weight_kg: number | null; parts: PreshopPart[] },
  nowMark: string, now: { length_mm: number | null; weight_kg: number | null; parts: PreshopPart[] },
): number {
  // body moved verbatim from PreshopService.pairScore (preshop.service.ts:166-181)
  const nowSpecs = now.parts.map(spec)
  let same = 0
  for (const k of was.parts.map(spec)) { const i = nowSpecs.indexOf(k); if (i >= 0) { same++; nowSpecs.splice(i, 1) } }
  const partScore = Math.max(was.parts.length, now.parts.length) ? same / Math.max(was.parts.length, now.parts.length) : 0
  const lScore = was.length_mm != null && now.length_mm != null && Math.abs(was.length_mm - now.length_mm) <= 1 ? 1 : 0
  const kgScore = was.weight_kg && now.weight_kg && Math.abs(was.weight_kg - now.weight_kg) <= was.weight_kg * 0.02 ? 1 : 0
  const norm = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const a = norm(wasMark), b = norm(nowMark)
  const nameScore = a && b && (a.includes(b) || b.includes(a)) ? 1 : 0
  return Math.round(100 * (0.6 * partScore + 0.15 * lScore + 0.15 * kgScore + 0.1 * nameScore))
}
