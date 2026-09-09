import type { PhaseSchedule, ScheduleProgress } from '../../api/projectProgress'

const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Ahead/behind vs a plan_pct — same green/red convention as delayStatus.ts's
// DELAY_STATUS_COLOR (on_track/overdue), not re-imported since this needs
// only the two colors, not the full delay-status machinery.
function DeltaLabel({ actual, plan }: { actual: number; plan: number }) {
  const diff = Math.round(actual - plan)
  if (diff === 0) return <span style={{ fontSize: 11, color: '#8E8E8E' }}>on pace</span>
  const ahead = diff > 0
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: ahead ? '#2E9E5F' : '#C8202A' }}>
      {ahead ? '▲' : '▼'} {Math.abs(diff)}pt {ahead ? 'ahead' : 'behind'}
    </span>
  )
}

// One phase's block — its own window/day-count (approximated from that
// phase's own plan-finish date spread, so Fab and Erection show genuinely
// different windows, not one shared number) with Plan vs Actual sharing
// that same line, right-aligned — no separate delta row underneath.
function PhaseBlock({ label, phase }: { label: string; phase: PhaseSchedule }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#ABABAB', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {phase.window_start && phase.window_end ? (
          <span style={{ fontSize: 11.5, color: '#8E8E8E' }}>
            {fmtDate(phase.window_start)} → {fmtDate(phase.window_end)}
            {phase.plan_pct !== null && (
              <>
                {' · '}
                <b style={{ ...mono, color: '#1A1A1A' }}>{phase.elapsed_days}/{phase.total_days}d</b> elapsed
              </>
            )}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: '#ABABAB' }}>No plan dates set yet</span>
        )}
        <div style={{ display: 'flex', gap: 12, fontSize: 12.5, flexShrink: 0 }}>
          {phase.plan_pct !== null && (
            <span style={{ color: '#555555' }}>Plan <b style={{ ...mono, color: '#1A1A1A' }}>{phase.plan_pct.toFixed(0)}%</b></span>
          )}
          <span style={{ color: '#555555' }}>Actual <b style={{ ...mono, color: '#1A1A1A' }}>{phase.actual_pct.toFixed(0)}%</b></span>
        </div>
      </div>
    </div>
  )
}

// Plan-vs-actual for Fab and Erection, each against its OWN schedule window
// (a real project's erection window starts later than fab, not the same
// span — see computeScheduleProgress's backend comment), plus a Combined
// row blending both 50/50 (matching the client's own Excel formula).
//
// Bare content only — no card chrome, no own header. Lives as the 3rd tab
// ("schedule") inside the same Fab/Erection Plan card both desktop
// (ProjectProgress.tsx) and mobile (MobileProgressStatCards.tsx) already
// have, rather than its own separate card, so the card's existing dot +
// label + tab-switcher header is reused instead of duplicated. Plain inline
// styles (not Tailwind) so it renders identically in both contexts.
export function ScheduleTabBody({ schedule }: { schedule: ScheduleProgress }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PhaseBlock label="Fabrication" phase={schedule.fab} />
      <div style={{ borderTop: '1px solid #F0F0F0' }} />
      <PhaseBlock label="Erection" phase={schedule.erection} />
      <div style={{ borderTop: '1px solid #F0F0F0' }} />
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#ABABAB', marginBottom: 3 }}>
          Combined
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 12.5 }}>
            {schedule.combined_plan_pct !== null && (
              <span style={{ color: '#555555' }}>Plan <b style={{ ...mono, color: '#1A1A1A' }}>{schedule.combined_plan_pct.toFixed(0)}%</b></span>
            )}
            <span style={{ color: '#555555' }}>Actual <b style={{ ...mono, color: '#1A1A1A' }}>{schedule.combined_actual_pct.toFixed(0)}%</b></span>
          </div>
          {schedule.combined_plan_pct !== null && <DeltaLabel actual={schedule.combined_actual_pct} plan={schedule.combined_plan_pct} />}
        </div>
      </div>
    </div>
  )
}
