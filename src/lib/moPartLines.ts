import type { PartLine } from '../api/mo'

// Mirrors backend mo-part/part-lines.ts rules so the review table can show
// errors per cell before Save; the server re-validates (wiki
// features/mo-part-import-plan §5).
const key = (l: PartLine) => `${l.profile.trim().toUpperCase()}|${l.grade.trim().toUpperCase()}|${Number(l.length_mm)}`

export function rowErrors(lines: PartLine[]): Map<number, string[]> {
  const out = new Map<number, string[]>()
  lines.forEach((l, i) => {
    const e: string[] = []
    if (!l.profile.trim()) e.push('profile is required')
    if (!l.grade.trim()) e.push('grade is required')
    if (!(Number(l.length_mm) > 0)) e.push('length must be > 0')
    if (!Number.isInteger(Number(l.qty)) || Number(l.qty) <= 0) e.push('qty must be a whole number > 0')
    if (l.unit_weight_kg != null && Number(l.unit_weight_kg) < 0) e.push('weight must be ≥ 0')
    if (e.length) out.set(i, e)
  })
  return out
}

export function duplicateGroups(lines: PartLine[]): number[][] {
  const by = new Map<string, number[]>()
  lines.forEach((l, i) => {
    if (!l.profile.trim() || !l.grade.trim() || !(Number(l.length_mm) > 0)) return
    by.set(key(l), [...(by.get(key(l)) ?? []), i])
  })
  return [...by.values()].filter(g => g.length > 1)
}

export function mergeRows(lines: PartLine[], group: number[]): PartLine[] {
  const [first, ...rest] = group
  const target = { ...lines[first] }
  for (const i of rest) {
    target.qty = Number(target.qty) + Number(lines[i].qty)
    if (lines[i].bom_part_ids?.length) target.bom_part_ids = [...(target.bom_part_ids ?? []), ...lines[i].bom_part_ids!]
  }
  return lines.flatMap((l, i) => (i === first ? [target] : rest.includes(i) ? [] : [l]))
}

export function totalWeight(lines: PartLine[]): number {
  return lines.reduce((s, l) => s + (l.unit_weight_kg == null ? 0 : Number(l.qty) * Number(l.unit_weight_kg)), 0)
}
