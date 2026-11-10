import type { CuttingPlanListItem } from '../../api/cutting-plan'

// Labelled header facts of a cutting plan (2026-11-06): "Project 0X202 Warehouse … · Zone WH Warehouse
// Building · Lot BIG-244", so nobody has to guess which word is the zone and which is the lot.
export function PlanMeta({ plan, size = 'line' }: { plan: Pick<CuttingPlanListItem, 'project' | 'zone' | 'sub_zone' | 'lot'>; size?: 'title' | 'line' }) {
  const big = size === 'title'
  const items: [string, string | null, string | null][] = [
    ['Project', plan.project?.project_code ?? null, plan.project?.name ?? null],
    // no zone on a picked project = All zones (whole project), 2026-11-10
    ['Zone', plan.zone?.code ?? (plan.project ? 'All zones' : null), plan.zone?.label ?? null],
    ['Sub-zone', plan.sub_zone ? (plan.sub_zone.code || plan.sub_zone.name) : null, plan.sub_zone?.code ? plan.sub_zone.name : null],
    ['Lot', plan.lot ?? null, null],
  ]
  const shown = items.filter(([, v]) => v)
  if (!shown.length) return null
  return (
    <div className="flex items-center flex-wrap" style={{ gap: big ? '2px 20px' : '2px 14px', fontSize: big ? 14 : 12, minWidth: 0 }}>
      {shown.map(([label, value, name]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: big ? 12 : 11, fontWeight: 600, color: '#9CA3AF' }}>{label} :</span>
          <span style={{ fontWeight: 600, color: big ? '#1F1F1F' : '#374151', fontSize: big ? 16 : undefined }}>{value}</span>
          {name && <span style={{ color: '#8E8E8E', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: big ? 460 : 280 }}>{name}</span>}
        </span>
      ))}
    </div>
  )
}
