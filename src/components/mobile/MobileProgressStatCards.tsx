import type { ProgressRollupTotals } from '../../api/projectProgress'
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

// Mirrors the desktop Overview tab's 4 stat cards (ProjectProgress.tsx's
// StatCard/PhaseBar) — same fields, same order (Progress → Total Weight →
// Assemblies → Done), stacked full-width instead of a 2x4 grid since the
// Progress card's 4 phase bars need more room than a phone-width half
// column gives. Takes any ProgressRollupTotals — project-wide
// `overview.total` (MobileZoneList) or a single zone's rollup out of
// `overview.zones` (MobileAssemblyList) — both share this shape.
export function MobileProgressStatCards({ total }: { total: ProgressRollupTotals }) {
  return (
    <>
      <div className="bg-white border border-chrome-100 rounded-xl p-4">
        <div className="text-[11px] font-bold uppercase tracking-wide text-chrome-400 mb-3">Progress</div>
        <div className="flex flex-col gap-2.5">
          <PhaseBarRow label="Fab" pct={total.fab_pct} color={PHASE_META.fabrication.dark} />
          <PhaseBarRow label="Pay" pct={total.payment_pct} color={PHASE_META.payment.dark} />
          <PhaseBarRow label="Trans" pct={total.load_pct} color={PHASE_META.load.dark} />
          <PhaseBarRow label="Erect" pct={total.erect_pct} color={PHASE_META.erection.dark} />
        </div>
      </div>

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
    </>
  )
}
