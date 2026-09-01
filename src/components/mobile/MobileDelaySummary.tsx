import { useState } from 'react'
import { Info } from 'lucide-react'
import type { ProgressZoneRollup } from '../../api/projectProgress'
import type { ProjectZoneDTO } from '../../api/types'
import { computeDelayInfo, DELAY_STATUS_COLOR } from '../progress/delayStatus'
import { MobileDelayInfoSheet } from './MobileDelayInfoSheet'

// Aggregate counterpart to the per-zone dot rendered in MobileZoneList's
// zones tab — same computeDelayInfo tally as desktop's Assemblies-card
// summary line, but plain counting text only (no formula, no hover — mobile
// has no hover surface for it).
interface Props {
  zones: ProgressZoneRollup[]
  zoneMeta: ProjectZoneDTO[]
}

export function MobileDelaySummary({ zones, zoneMeta }: Props) {
  const [legendOpen, setLegendOpen] = useState(false)
  const metaById = new Map(zoneMeta.map(z => [z.id, z]))
  let overdue = 0, atRisk = 0, scheduled = 0
  for (const z of zones) {
    const meta = metaById.get(z.zone_id)
    const info = meta ? computeDelayInfo(meta.target_erection_start, meta.target_erection_end, z.erect_pct) : null
    if (!info) continue
    scheduled++
    if (info.status === 'overdue') overdue++
    else if (info.status === 'at_risk') atRisk++
  }

  if (scheduled === 0) return null

  return (
    <div className="bg-white border border-chrome-100 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-chrome-400">Schedule</span>
        <button onClick={() => setLegendOpen(true)} aria-label="How is this calculated?" className="flex-shrink-0 text-chrome-300 active:text-chrome-500">
          <Info size={13} />
        </button>
      </div>
      <MobileDelayInfoSheet open={legendOpen} onClose={() => setLegendOpen(false)} title="Schedule status">
        <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-chrome-600">
          <div><b style={{ color: DELAY_STATUS_COLOR.overdue }}>Overdue</b> — target erection end date has passed and the zone isn't 100% erected.</div>
          <div><b style={{ color: DELAY_STATUS_COLOR.at_risk }}>At risk</b> — erection window is still open, but erect % is more than 15 points behind the % of the window's time already elapsed.</div>
          <div><b style={{ color: DELAY_STATUS_COLOR.on_track }}>On track</b> — erect % is keeping pace (or ahead), 100% complete, or the window hasn't started yet.</div>
        </div>
      </MobileDelayInfoSheet>
      {overdue === 0 && atRisk === 0 ? (
        <div className="text-[13.5px] font-medium" style={{ color: DELAY_STATUS_COLOR.on_track }}>✓ All zones on track</div>
      ) : (
        <div className="text-[13.5px]">
          {overdue > 0 && (
            <span className="font-semibold" style={{ color: DELAY_STATUS_COLOR.overdue }}>
              {overdue} zone{overdue > 1 ? 's' : ''} overdue
            </span>
          )}
          {overdue > 0 && atRisk > 0 && <span className="text-chrome-400"> · </span>}
          {atRisk > 0 && (
            <span className="font-semibold" style={{ color: DELAY_STATUS_COLOR.at_risk }}>
              {atRisk} zone{atRisk > 1 ? 's' : ''} at risk
            </span>
          )}
        </div>
      )}
    </div>
  )
}
