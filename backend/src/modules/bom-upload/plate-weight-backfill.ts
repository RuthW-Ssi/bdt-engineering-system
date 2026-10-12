// Backfill plan for the plate-weight bug (memory project_bom_plate_weight_bug,
// fixed in buildDedupedParts 2026-10-06): existing PL-profile bom_part rows
// hold the NC kg/m² value. The correct per-piece weight is in the dispatch's
// stored Part List xlsx. Pure — the script in backend/prisma does the I/O.

export interface PlatePartRow { id: number; dispatch_id: number; part_mark: string; profile: string | null; weight_kg: number | null }
export interface PlateFix { id: number; dispatch_id: number; part_mark: string; from: number | null; to: number }

const isPlate = (profile: string | null) => (profile ?? '').trim().toUpperCase().startsWith('PL')

export function planPlateWeightFixes(rows: PlatePartRow[], weightsByDispatch: Map<number, Map<string, number | null>>) {
  const fixes: PlateFix[] = []
  const skipped: { id: number; part_mark: string; reason: string }[] = []
  let unchanged = 0
  for (const r of rows) {
    if (!isPlate(r.profile)) continue
    const weights = weightsByDispatch.get(r.dispatch_id)
    if (!weights) { skipped.push({ id: r.id, part_mark: r.part_mark, reason: `no stored Part List for dispatch ${r.dispatch_id}` }); continue }
    const to = weights.get(r.part_mark)
    if (to == null) { skipped.push({ id: r.id, part_mark: r.part_mark, reason: 'no weight in the Part List' }); continue }
    if (r.weight_kg != null && Math.abs(r.weight_kg - to) < 0.0005) { unchanged++; continue }
    fixes.push({ id: r.id, dispatch_id: r.dispatch_id, part_mark: r.part_mark, from: r.weight_kg, to })
  }
  return { fixes, skipped, unchanged }
}
