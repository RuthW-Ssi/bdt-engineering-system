import { useState } from 'react'
import type { PlanDateBucket } from '../../api/projectProgress'

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

// Axis labels drop the year ("01 Jun", not "01 Jun 26") — shorter string
// needs less vertical room in the rotated writingMode:vertical-rl label
// below, and the year is already shown in the page's own date-range header.
const formatAxisDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

// Plan-vs-actual for Fab/Erect, grouped by each distinct plan-finish date —
// replaces what used to be a single percent bar for these two phases. A
// percent can't show plan-vs-actual meaningfully once assemblies/zones each
// plan their own date (see PlanDateBucket's comment on the backend); a
// per-date breakdown sidesteps that by never averaging across dates at all
// — every distinct plan date gets its own bar.
//
// Grouped bar chart (2026-09) — 3 side-by-side bars per date (Not Started/
// On Time/Delay), each scaled against the max single-category count across
// the whole dataset, instead of one stacked bar per date. Stacking hid each
// status's own trend behind a shared total; grouping shows all 3 at a
// glance and lets a date with e.g. high Delay stand out directly, not just
// as a bigger red segment on top of the others. Each date's 3-bar group is
// `flex:1` (not a fixed width) so the whole chart stretches to fill the
// card instead of leaving empty space when there are few plan dates;
// overflowX still handles the case where there are enough dates that a
// legible minWidth per group would overflow the card.
// Not Started is deliberately the lightest of the 3 — it's usually the
// tallest/most frequent bar (most dates haven't reached their plan date
// yet), so a muted fill lets it recede into the background instead of
// visually competing with the On Time/Delay bars that actually matter.
//
// Shared between desktop (ProjectProgress.tsx) and mobile
// (MobileProgressStatCards.tsx) — size props (barsHeight/groupGap/etc.)
// default to desktop's tuned values; mobile passes smaller ones to fit a
// phone-width card instead of forking the whole component.
const PLAN_BAR_COLOR = { not_started: '#EEEEEE', on_time: '#1A7A3D', delay: '#C8202A' } as const
const PLAN_STATUS_LABEL = { not_started: 'Not Started', on_time: 'On Time', delay: 'Delay' } as const
type PlanStatus = keyof typeof PLAN_BAR_COLOR

// Legend doubles as a checkbox filter — clicking a status toggles it out of
// both the rendered bars and the height scale, so hiding e.g. Not Started
// (usually the tallest/most frequent bar) lets On Time/Delay rescale to use
// the freed vertical range instead of staying visually tiny next to it.
function PlanStatusToggle({
  status, checked, onToggle, fontSize,
}: { status: PlanStatus; checked: boolean; onToggle: () => void; fontSize: number }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0,
        cursor: 'pointer', font: 'inherit', fontSize, color: checked ? '#8E8E8E' : '#C2C2C2', outline: 'none',
      }}
    >
      <span
        style={{
          width: 7, height: 7, borderRadius: 2, flexShrink: 0,
          background: checked ? PLAN_BAR_COLOR[status] : 'transparent',
          border: checked ? 'none' : `1px solid ${PLAN_BAR_COLOR[status] === '#EEEEEE' ? '#C2C2C2' : PLAN_BAR_COLOR[status]}`,
        }}
      />
      {PLAN_STATUS_LABEL[status]}
    </button>
  )
}

export function PlanDateBarChart({
  rows, barsHeight = 66, groupGap = 16, groupMinWidth = 34, barMaxWidth = 14, labelHeight = 50, dateFontSize = 9, legendFontSize = 10,
}: {
  rows: PlanDateBucket[]
  barsHeight?: number
  groupGap?: number
  groupMinWidth?: number
  barMaxWidth?: number
  labelHeight?: number
  dateFontSize?: number
  legendFontSize?: number
}) {
  const [visible, setVisible] = useState<Record<PlanStatus, boolean>>({ not_started: true, on_time: true, delay: true })
  if (rows.length === 0) {
    return <div style={{ fontSize: 11.5, color: '#ABABAB', padding: '2px 0 2px 14px' }}>No plan dates set yet</div>
  }
  const statuses = (['not_started', 'on_time', 'delay'] as const).filter(s => visible[s])
  const maxCount = Math.max(...rows.flatMap(r => statuses.map(s => r[s])), 1)
  const scale = barsHeight / maxCount
  const barHeight = (n: number) => (n > 0 ? Math.max(n * scale, 2) : 0)
  return (
    <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: groupGap, height: barsHeight, flexShrink: 0 }}>
        {rows.map(r => (
          <div
            key={r.date}
            title={`${formatDate(r.date)} — Total ${r.total}, Not Started ${r.not_started}, On Time ${r.on_time}, Delay ${r.delay}`}
            style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, flex: '1 1 0', minWidth: groupMinWidth, height: '100%' }}
          >
            {statuses.map(s => (
              <div key={s} style={{ flex: 1, maxWidth: barMaxWidth, height: barHeight(r[s]), background: PLAN_BAR_COLOR[s], borderRadius: '2px 2px 0 0' }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: groupGap, marginTop: 4, flexShrink: 0 }}>
        {rows.map(r => (
          <div key={r.date} style={{ flex: '1 1 0', minWidth: groupMinWidth, height: labelHeight, display: 'flex', justifyContent: 'center' }}>
            <span
              style={{
                fontSize: dateFontSize, fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: '#8E8E8E',
                writingMode: 'vertical-rl', transform: 'rotate(180deg)', overflow: 'hidden', whiteSpace: 'nowrap',
              }}
            >
              {formatAxisDate(r.date)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4, flexShrink: 0 }}>
        {(['not_started', 'on_time', 'delay'] as const).map(s => (
          <PlanStatusToggle key={s} status={s} checked={visible[s]} onToggle={() => setVisible(v => ({ ...v, [s]: !v[s] }))} fontSize={legendFontSize} />
        ))}
      </div>
    </div>
  )
}
