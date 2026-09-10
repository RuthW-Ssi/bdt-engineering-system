import type { PhaseSchedule, ScheduleProgress } from '../../api/projectProgress'

const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Bullet graph — one filled bar (Actual, 0-100%) plus a marker line
// (Plan) crossing it, instead of two full separate bars. Purpose-built
// for exactly this "one actual value vs one target" comparison in a
// small space (the pattern this style is named after), which fits this
// card's per-row height far better than a gauge/dial or a second stacked
// bar would. `plan` null (no window to compare against) just omits the
// marker — the actual bar still renders on its own.
function BulletBar({ plan, actual }: { plan: number | null; actual: number }) {
  const ahead = plan === null || actual >= plan
  const barColor = ahead ? '#2E9E5F' : '#C8202A'
  const actualWidth = Math.max(0, Math.min(100, actual))
  return (
    <div style={{ position: 'relative', height: 7, background: '#EDEFF2', borderRadius: 4, marginTop: 6 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${actualWidth}%`, background: barColor, borderRadius: 4 }} />
      {plan !== null && (
        <div
          title={`Plan ${plan.toFixed(0)}%`}
          style={{
            position: 'absolute', left: `${Math.max(0, Math.min(100, plan))}%`, top: -2, bottom: -2,
            width: 2, background: '#1A1A1A', transform: 'translateX(-1px)', borderRadius: 1,
          }}
        />
      )}
    </div>
  )
}

// One phase's block — its own window/day-count (approximated from that
// phase's own plan-finish date spread, so Fab and Erection show genuinely
// different windows, not one shared number), Plan/Actual numbers, and a
// BulletBar visualizing the same two values.
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
      <BulletBar plan={phase.plan_pct} actual={phase.actual_pct} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <PhaseBlock label="Fabrication" phase={schedule.fab} />
      <div style={{ borderTop: '1px solid #F0F0F0' }} />
      <PhaseBlock label="Erection" phase={schedule.erection} />
      <div style={{ borderTop: '1px solid #F0F0F0' }} />
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#ABABAB', marginBottom: 3 }}>
          Combined
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12.5 }}>
          {schedule.combined_plan_pct !== null && (
            <span style={{ color: '#555555' }}>Plan <b style={{ ...mono, color: '#1A1A1A' }}>{schedule.combined_plan_pct.toFixed(0)}%</b></span>
          )}
          <span style={{ color: '#555555' }}>Actual <b style={{ ...mono, color: '#1A1A1A' }}>{schedule.combined_actual_pct.toFixed(0)}%</b></span>
        </div>
        <BulletBar plan={schedule.combined_plan_pct} actual={schedule.combined_actual_pct} />
      </div>
    </div>
  )
}
