import { useState } from 'react'
import type { ProgressRollupTotals, ScheduleProgress } from '../../api/projectProgress'
import { PHASE_META } from '../progress/statusMeta'
import { ScheduleTabBody } from '../progress/SchedulePlanVsActualCard'
import { PlanDateBarChart } from '../progress/PlanDateBarChart'

// Takes any ProgressRollupTotals — project-wide `overview.total`
// (MobileZoneList) or a single zone's rollup out of `overview.zones`
// (MobileAssemblyList) — both share this shape, and fab_plan_breakdown/
// erection_plan_breakdown on it are already scoped correctly either way
// (project-wide vs that one zone) since the backend computes them as part
// of the same rollup, not as a separate project-wide-only field.
//
// `schedule` is optional and project-wide only (MobileZoneList passes
// `overview.schedule_progress`; MobileAssemblyList's per-zone call omits
// it, since a single zone doesn't get its own schedule window) — the
// Schedule tab only appears when it's present.
export function MobileProgressStatCards({ total, schedule }: { total: ProgressRollupTotals; schedule?: ScheduleProgress }) {
  const [planTab, setPlanTab] = useState<'fab' | 'erection' | 'schedule'>(schedule ? 'schedule' : 'fab')
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
        {/* Fab/Erect used to be percent bars here too, and Pay/Trans sat
            alongside them — both dropped, matching desktop: Payment/
            Transport progress is already visible elsewhere (isolate-by-
            status pills on the 3D tab, F/T/E in the assembly rows), so
            this card is scoped to the two phases with a plan-date to show. */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: planTab === 'fab' ? PHASE_META.fabrication.dark : planTab === 'erection' ? PHASE_META.erection.dark : '#8E8E8E' }}
            />
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-chrome-400">
              {planTab === 'fab' ? 'Fab Plan' : planTab === 'erection' ? 'Erection Plan' : 'Schedule'}
            </span>
          </div>
          <div className="flex gap-0.5 bg-chrome-50 border border-chrome-100 rounded-lg p-0.5">
            {(schedule ? (['schedule', 'fab', 'erection'] as const) : (['fab', 'erection'] as const)).map(t => (
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
        {planTab === 'schedule' && schedule ? (
          <ScheduleTabBody schedule={schedule} />
        ) : (
          <PlanDateBarChart
            rows={planTab === 'fab' ? total.fab_plan_breakdown : total.erection_plan_breakdown}
            barsHeight={64} groupGap={10} groupMinWidth={26} barMaxWidth={10} labelHeight={40} dateFontSize={8} legendFontSize={9}
          />
        )}
      </div>
    </>
  )
}
