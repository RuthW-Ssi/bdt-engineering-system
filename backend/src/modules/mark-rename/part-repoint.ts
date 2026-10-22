// WO part rows follow their assembly to a new BOM version (MO switch 2026-10-09;
// WO accept fix 2026-10-21): to the same part mark, or to the part's confirmed
// new name. An untouched row with no target is dropped; a row whose withdrawal
// was entered (updated_by set) and has no target blocks — as today.
export interface RepointPart { id: number; part_mark: string }
export interface RepointWoPart { id: number; work_order_id: number; bom_assembly_part_id: number; updated_by: string | null }
export interface RepointPlan { moves: { id: number; to: number }[]; drops: number[]; stuck: { id: number; work_order_id: number; part_mark: string }[]; usedRenameIds: number[] }

export function planPartRepoint(
  oldParts: RepointPart[], newParts: RepointPart[], woParts: RepointWoPart[],
  targetOf: (mark: string) => { mark: string | null; renameIds: number[] },
): RepointPlan {
  const oldMark = new Map(oldParts.map(p => [p.id, p.part_mark]))
  const newId = new Map(newParts.map(p => [p.part_mark, p.id]))
  // (work_order_id, bom_assembly_part_id) is unique — rows already on the new version hold their slot
  const taken = new Set(woParts.filter(w => !oldMark.has(w.bom_assembly_part_id)).map(w => `${w.work_order_id}:${w.bom_assembly_part_id}`))
  const plan: RepointPlan = { moves: [], drops: [], stuck: [], usedRenameIds: [] }
  for (const w of woParts) {
    const mark = oldMark.get(w.bom_assembly_part_id)
    if (mark == null) continue
    const t = targetOf(mark)
    const to = t.mark != null ? newId.get(t.mark) : undefined
    if (to != null && !taken.has(`${w.work_order_id}:${to}`)) {
      taken.add(`${w.work_order_id}:${to}`)
      plan.moves.push({ id: w.id, to })
      if (t.mark !== mark) plan.usedRenameIds.push(...t.renameIds)
    } else if (w.updated_by) plan.stuck.push({ id: w.id, work_order_id: w.work_order_id, part_mark: mark })
    else plan.drops.push(w.id)
  }
  return plan
}
