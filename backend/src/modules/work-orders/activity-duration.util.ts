// Extracted from WorkOrderAutoCreateService.computeDuration() (2026-09-15) —
// same formula-code branching, same clamping, byte-for-byte identical
// aggregate result — but now also returns a per-activity breakdown, needed
// by the MO print packet's traveler pages ("Activities" section, so a
// factory-floor user can see whether the planned activity list is complete
// or needs activities added/removed, and how much time each one
// contributes). Kept as a standalone pure function rather than inlined in
// either caller so the exact same math backs both real WO creation and the
// print packet — no risk of the two silently drifting apart.
export interface ActivityDurationBreakdownItem {
  name: string
  kind: 'setup' | 'run'
  minutes: number
  // true when this activity has no source_activity_id, or its id isn't in
  // activityMap — surfaces a gap in the routing setup (an activity with no
  // resolvable time formula) instead of silently showing "0 min"
  // indistinguishable from a genuinely instant one.
  unresolved: boolean
}

export interface ActivityDurationResult {
  run_min: number
  setup_min: number
  breakdown: ActivityDurationBreakdownItem[]
}

// Multi-mark redesign (2026-09-17): a work_order_mark's contribution to its WO's
// totals must be summed with every OTHER mark's contribution (× that mark's
// qty_planned) BEFORE the final rounding/clamping — rounding once per mark first
// would compound rounding error across marks. This raw variant returns the
// unrounded, unclamped run_min/setup_min for exactly ONE unit of ONE bom (the
// same per-activity math `computeActivityDuration` always used), so a caller
// (WorkOrderAutoCreateService.recomputeDuration()) can multiply-then-sum-then-
// round-once across all of a WO's non-removed marks. `computeActivityDuration`
// itself is unchanged (byte-for-byte — same rounding/clamping as before) and
// stays the right call for any single-bom, single-unit use (e.g. the MO print
// packet's per-WO traveler, still 1 bom per WO there).
export function computeActivityDurationRaw(
  acts: { name: string; source_activity_id: number | null }[],
  bom: { length_mm: unknown; surface_area_m2: unknown; width_mm: unknown },
  activityMap: Map<number, { formula_code: string | null; per_minute: unknown; duration_min: unknown; kind: string }>,
): { run_min: number; setup_min: number; breakdown: ActivityDurationBreakdownItem[] } {
  const lengthMm = Number(bom.length_mm ?? 0)
  const areaSqM = Number(bom.surface_area_m2 ?? 0)
  const widthMm = Number(bom.width_mm ?? 0)

  let runMin = 0
  let setupMin = 0
  const breakdown: ActivityDurationBreakdownItem[] = []

  for (const snapAct of acts) {
    const srcId = snapAct.source_activity_id as number | null
    const act = srcId ? activityMap.get(srcId) : undefined
    if (!srcId || !act) {
      breakdown.push({ name: snapAct.name, kind: 'run', minutes: 0, unresolved: true })
      continue
    }

    const rate = Number(act.per_minute ?? 0)
    const fixedMin = Number(act.duration_min ?? 0)

    // Setup activities: always fixed time, goes into setup_time_min
    if (act.kind === 'setup') {
      setupMin += fixedMin
      breakdown.push({ name: snapAct.name, kind: 'setup', minutes: fixedMin, unresolved: false })
      continue
    }

    // Map formula_code → dimensional quantity
    let contribution: number
    switch (act.formula_code) {
      case 'weld_length_mm':
      case 'cut_length_mm':
      case 'edge_length_mm':
      case 'bevel_length_mm':
        contribution = rate > 0 ? lengthMm / rate : fixedMin
        break

      case 'product_area':
      case 'sumNet_surface_area':
        contribution = rate > 0 ? areaSqM / rate : fixedMin
        break

      // Perimeter expression yields mm, but per_minute is m/min → ÷1000
      case 'product_perimeter':
        contribution = rate > 0 ? (2 * lengthMm + 2 * widthMm) / 1000 / rate : fixedMin
        break

      // Count-based: count not stored in bom_assembly → use fixed duration_min
      case 'per_piece':
      case 'per unit':
      case 'bend_count':
      case 'hole_count':
      case 'tack_points':
      case 'assembly_point':
      case 'count_part':
      case 'cut_count':
        contribution = fixedMin
        break

      default:
        contribution = fixedMin
    }

    runMin += contribution
    breakdown.push({ name: snapAct.name, kind: 'run', minutes: contribution, unresolved: false })
  }

  // Fallback: no activities matched → duration stays 0 — left unclamped here;
  // computeActivityDuration() (single-unit callers) clamps to 1, multi-mark
  // summation (recomputeDuration()) clamps once after summing every mark.

  return { run_min: runMin, setup_min: setupMin, breakdown }
}

// Thin wrapper over computeActivityDurationRaw() — same rounding/clamping this
// function has always done, for callers computing ONE unit's duration in
// isolation (MO print packet's per-WO traveler; anywhere no multi-mark
// summation is involved).
export function computeActivityDuration(
  acts: { name: string; source_activity_id: number | null }[],
  bom: { length_mm: unknown; surface_area_m2: unknown; width_mm: unknown },
  activityMap: Map<number, { formula_code: string | null; per_minute: unknown; duration_min: unknown; kind: string }>,
): ActivityDurationResult {
  const raw = computeActivityDurationRaw(acts, bom, activityMap)
  return {
    run_min: Math.max(1, Math.round(raw.run_min)),
    setup_min: Math.max(0, Math.round(raw.setup_min)),
    breakdown: raw.breakdown,
  }
}
