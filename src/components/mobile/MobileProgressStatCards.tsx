import { useState } from 'react'
import type { ProgressRollupTotals, PlanDateBucket } from '../../api/projectProgress'
import { PHASE_META } from '../progress/statusMeta'

// Plan-vs-actual for Fab/Erect, grouped by each distinct plan-finish date —
// same Date/Total/Not Started/On Time/Delay table as desktop's PlanDateTable
// (ProjectProgress.tsx), just sized down for a phone; overflow-x-auto is
// the safety net if a run of long numbers ever doesn't fit.
function PlanDateTable({ rows }: { rows: PlanDateBucket[] }) {
  if (!rows.length) return <div className="text-[11.5px] text-chrome-300 py-1.5">No plan dates set yet</div>
  return (
    <div className="max-h-40 overflow-y-auto overflow-x-auto border border-chrome-50 rounded-lg">
      <table className="w-full text-[10.5px] font-mono border-collapse">
        <thead>
          <tr>
            <th className="sticky top-0 bg-white text-left font-bold uppercase tracking-wide text-chrome-400 px-2 py-1.5 border-b border-chrome-100 whitespace-nowrap">Plan Date</th>
            <th className="sticky top-0 bg-white text-right font-bold uppercase tracking-wide text-chrome-400 px-2 py-1.5 border-b border-chrome-100 whitespace-nowrap">Total</th>
            <th className="sticky top-0 bg-white text-right font-bold uppercase tracking-wide text-chrome-400 px-2 py-1.5 border-b border-chrome-100 whitespace-nowrap">Not Started</th>
            <th className="sticky top-0 bg-white text-right font-bold uppercase tracking-wide text-chrome-400 px-2 py-1.5 border-b border-chrome-100 whitespace-nowrap">On Time</th>
            <th className="sticky top-0 bg-white text-right font-bold uppercase tracking-wide text-chrome-400 px-2 py-1.5 border-b border-chrome-100 whitespace-nowrap">Delay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.date}>
              <td className="text-left font-semibold text-chrome-900 px-2 py-1.5 border-b border-chrome-50 whitespace-nowrap">
                {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
              </td>
              <td className="text-right px-2 py-1.5 border-b border-chrome-50">{r.total}</td>
              <td className="text-right px-2 py-1.5 border-b border-chrome-50 text-chrome-300">{r.not_started}</td>
              <td className="text-right px-2 py-1.5 border-b border-chrome-50" style={{ color: '#1A7A3D' }}>{r.on_time}</td>
              <td className="text-right px-2 py-1.5 border-b border-chrome-50" style={r.delay > 0 ? { color: '#C8202A', fontWeight: 700 } : { color: '#ABABAB' }}>{r.delay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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
        {/* Fab/Erect used to be percent bars here too, and Pay/Trans sat
            alongside them — both dropped, matching desktop: Payment/
            Transport progress is already visible elsewhere (isolate-by-
            status pills on the 3D tab, F/M/T/E in the assembly rows), so
            this card is scoped to the two phases with a plan-date to show. */}
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
        <PlanDateTable rows={planTab === 'fab' ? total.fab_plan_breakdown : total.erection_plan_breakdown} />
      </div>
    </>
  )
}
