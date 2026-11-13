import type { CuttingPlanListItem } from '../../api/cutting-plan'

type Picks = Pick<CuttingPlanListItem, 'id' | 'project' | 'zone' | 'sub_zone'>

// How an upload is named on screen since Tag was dropped (2026-11-06):
// "0X197 · Z1 / SZ-A", or "Upload #12" for older uploads made before the pick existed.
export function planLabel(cp: Picks): string {
  if (!cp.project) return `Upload #${cp.id}`
  const zone = cp.zone ? ` · ${cp.zone.code}` : ' · All zones' // no zone = whole project (2026-11-10)
  const sub = cp.sub_zone ? ` / ${cp.sub_zone.code || cp.sub_zone.name}` : ''
  return `${cp.project.project_code}${zone}${sub}`
}
