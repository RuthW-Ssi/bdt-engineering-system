import type { BomCompare } from '../api/mo'

/**
 * A mark already paired on the BOM page (2026-10-21) — its `bom` is already the
 * resolved (renamed) target, so this only seeds `pair_with` for the no-op
 * contract the backend accepts (task-6-report.md "Fix round 2" #2). It never
 * forces the MO compare's own decision to "apply": each section's normal
 * default/buttons still apply, so the visible button state always matches
 * what will be submitted (controller ruling, Task 10). Reviewed rows are
 * left alone — they're already past this compare.
 */
export function prePairs(rows: BomCompare['rows']): { pairWith: Record<string, number>; apply: string[] } {
  const pre = rows.filter(r => !r.reviewed && r.renamed_to)
  return { pairWith: Object.fromEntries(pre.map(r => [r.assembly_mark, r.renamed_to!.assembly_id])), apply: pre.map(r => r.assembly_mark) }
}
