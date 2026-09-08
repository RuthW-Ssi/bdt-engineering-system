import { useState } from 'react'
import type { ProgressRollupTotals, PlanDateBucket } from '../../api/projectProgress'
import { PHASE_META } from '../progress/statusMeta'

function PhaseBarRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-chrome-400 w-11 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-chrome-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <b className="font-mono text-[11.5px] w-11 text-right flex-shrink-0 text-chrome-900">
        {pct.toFixed(0)}%
      </b>
    </div>
  )
}

// Plan-vs-actual for Fab/Erect, grouped by each distinct plan-finish date —
// mirrors desktop's PlanDateTable (ProjectProgress.tsx), but a wide 5-column
// table doesn't fit a phone screen, so each date is one wrapping text line
// instead — same idiom MobileAssemblyList.tsx already uses for its own
// deleted-assemblies row list.
function PlanDateRow({ bucket }: { bucket: PlanDateBucket }) {
  const dateLabel = new Date(bucket.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-t border-chrome-50 text-[11.5px]">
      <span className="font-mono font-semibold text-chrome-900 flex-shrink-0">{dateLabel}</span>
      <span className="font-mono text-chrome-400 text-right">
        <b className="text-chrome-900">{bucket.total}</b> total
        {' · '}<span className="text-chrome-300">{bucket.not_started} not started</span>
        {' · '}<span style={{ color: '#1A7A3D' }}>{bucket.on_time} on time</span>
        {' · '}<span style={bucket.delay > 0 ? { color: '#C8202A', fontWeight: 700 } : undefined}>{bucket.delay} delay</span>
      </span>
    </div>
  )
}

function PlanDateList({ rows }: { rows: PlanDateBucket[] }) {
  if (!rows.length) return <div className="text-[11.5px] text-chrome-300 py-1.5">No plan dates set yet</div>
  return <div className="max-h-40 overflow-y-auto">{rows.map(r => <PlanDateRow key={r.date} bucket={r} />)}</div>
}

// Takes any ProgressRollupTotals — project-wide `overview.total`
// (MobileZoneList) or a single zone's rollup out of `overview.zones`
// (MobileAssemblyList) — both share this shape, and fab_plan_breakdown/
// erection_plan_breakdown on it are already scoped correctly either way
// (project-wide vs that one zone) since the backend computes them as part
// of the same rollup, not as a separate project-wide-only field.
export function MobileProgressStatCards({ total }: { total: ProgressRollupTotals }) {
  const [planTab, setPlanTab] = useState<'fab' | 'erection'>('fab')
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-chrome-100 rounded-xl p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-chrome-400">Total Weight</div>
          <div className="font-mono text-[22px] font-bold text-chrome-900 mt-1.5">{(total.total_weight_kg / 1000).toFixed(1)} t</div>
        </div>
        <div className="bg-white border border-chrome-100 rounded-xl p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-chrome-400">Assemblies</div>
          <div className="font-mono text-[22px] font-bold text-chrome-900 mt-1.5">{total.assembly_count}</div>
        </div>
      </div>

      <div className="bg-white border border-chrome-100 rounded-xl p-4">
        <div className="text-[11px] font-bold uppercase tracking-wide text-chrome-400">Done</div>
        <div className="font-mono text-[22px] font-bold mt-1.5" style={{ color: '#2E9E5F' }}>{total.buckets.done}</div>
        <div className="text-[11.5px] text-chrome-400 mt-1.5">
          <span className="font-mono" style={{ color: '#4A85C4' }}>{total.buckets.in_progress}</span> in progress ·{' '}
          <span className="font-mono">{total.buckets.notstart}</span> not started
        </div>
      </div>

      <div className="bg-white border border-chrome-100 rounded-xl p-4">
        {/* Fab/Erect used to be percent bars here too — dropped in favor of
            the date-grouped breakdown below (Pay/Trans have no plan-date
            field, so they keep the plain bar). Mirrors the desktop card's
            same restructure. */}
        <div className="flex flex-col gap-2.5 mb-3">
          <PhaseBarRow label="Pay" pct={total.payment_pct} color={PHASE_META.payment.dark} />
          <PhaseBarRow label="Trans" pct={total.load_pct} color={PHASE_META.load.dark} />
        </div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: planTab === 'fab' ? PHASE_META.fabrication.dark : PHASE_META.erection.dark }}
            />
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-chrome-400">
              {planTab === 'fab' ? 'Fab Plan' : 'Erection Plan'}
            </span>
          </div>
          <div className="flex gap-0.5 bg-chrome-50 border border-chrome-100 rounded-lg p-0.5">
            {(['fab', 'erection'] as const).map(t => (
              <button
                key={t}
                onClick={() => setPlanTab(t)}
                className="text-[11px] font-bold capitalize px-3 py-1 rounded-md"
                style={{ background: planTab === t ? '#C8202A' : 'transparent', color: planTab === t ? 'white' : '#8E8E8E' }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <PlanDateList rows={planTab === 'fab' ? total.fab_plan_breakdown : total.erection_plan_breakdown} />
      </div>
    </>
  )
}
