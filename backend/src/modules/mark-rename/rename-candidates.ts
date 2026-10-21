import { pairScore } from '../manufacturing-orders/preshop/pair-score'
import type { PreshopPart } from '../manufacturing-orders/preshop/preshop-pdf-parser'

// Which marks/parts disappeared in a new BOM version and which new ones they
// may be (2026-10-21). Only a name that DISAPPEARED is offered, and only
// against names that FIRST appear in this version — a name still present is
// the same piece (decision 2). Suggestions only; the user confirms.
export const SUGGEST_MIN = 30
export const SUGGEST_TOP = 3

export interface AsmRow { id: number; mark: string; length_mm: number | null; weight_kg: number | null; parts: PreshopPart[] }
export interface PartRow { id: number; mark: string; profile: string | null; grade: string | null; length_mm: number | null; weight_kg: number | null }
export interface Suggestion { mark: string; ref_id: number; score: number }

export function splitDisappeared<T extends { mark: string }>(prev: T[], curr: T[], paired: { from: Set<string>; to: Set<string> }) {
  const prevNames = new Set(prev.map(r => r.mark))
  const currNames = new Set(curr.map(r => r.mark))
  return {
    disappeared: prev.filter(r => !currNames.has(r.mark) && !paired.from.has(r.mark)),
    fresh: curr.filter(r => !prevNames.has(r.mark) && !paired.to.has(r.mark)),
  }
}

const top = (s: Suggestion[]) => s.filter(x => x.score >= SUGGEST_MIN).sort((a, b) => b.score - a.score || a.mark.localeCompare(b.mark)).slice(0, SUGGEST_TOP)

export function suggestAssemblies(was: AsmRow, fresh: AsmRow[]): Suggestion[] {
  return top(fresh.map(c => ({ mark: c.mark, ref_id: c.id, score: pairScore(was.mark, was, c.mark, c) })))
}

/** Part-level twin of pairScore: same profile 35, L within 1 mm 25, same
 *  grade 10, kg within 2 % 20, one mark containing the other 10. */
export function partPairScore(was: PartRow, now: PartRow): number {
  const t = (s: string | null) => (s ?? '').trim().toUpperCase()
  const norm = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const a = norm(was.mark), b = norm(now.mark)
  return (t(was.profile) && t(was.profile) === t(now.profile) ? 35 : 0)
    + (was.length_mm != null && now.length_mm != null && Math.abs(was.length_mm - now.length_mm) <= 1 ? 25 : 0)
    + (t(was.grade) && t(was.grade) === t(now.grade) ? 10 : 0)
    + (was.weight_kg && now.weight_kg && Math.abs(was.weight_kg - now.weight_kg) <= was.weight_kg * 0.02 ? 20 : 0)
    + (a && b && (a.includes(b) || b.includes(a)) ? 10 : 0)
}

export function suggestParts(was: PartRow, fresh: PartRow[]): Suggestion[] {
  return top(fresh.map(c => ({ mark: c.mark, ref_id: c.id, score: partPairScore(was, c) })))
}
