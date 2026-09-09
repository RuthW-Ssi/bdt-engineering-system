import type { ScheduleProgress } from '../../api/projectProgress'

const ROW_LABEL: Record<'fab' | 'erection' | 'combined', string> = {
  fab: 'Fabrication', erection: 'Erection', combined: 'Combined',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Ahead/behind vs the single shared plan_pct — same green/red convention as
// delayStatus.ts's DELAY_STATUS_COLOR (on_track/overdue), not re-imported
// since this needs only the two colors, not the full delay-status machinery.
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

// Plan-vs-actual for Fab/Erection/Combined against ONE shared schedule
// position (schedule.plan_pct) — Fab and Erection both work inside the same
// whole-zone window (project_zone.target_start/end rolled up project-wide),
// so a phase-specific plan% would repeat the same number three times.
// Layout A from the design discussion: window + plan% shown once at the
// top, each row below just shows actual% + how far it is from that one
// number. Plain inline styles (not Tailwind) so this renders identically
// from both desktop (ProjectProgress.tsx) and mobile (MobileProgressStatCards.tsx).
export function SchedulePlanVsActualCard({ schedule }: { schedule: ScheduleProgress }) {
  const rows: { key: 'fab' | 'erection' | 'combined'; actual: number }[] = [
    { key: 'fab', actual: schedule.fab_actual_pct },
    { key: 'erection', actual: schedule.erection_actual_pct },
    { key: 'combined', actual: schedule.combined_actual_pct },
  ]
  return (
    <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8E8E8E', marginBottom: 8 }}>
        Schedule — Plan vs Actual
      </div>
      {schedule.window_start && schedule.window_end ? (
        <div style={{ fontSize: 12, color: '#8E8E8E', marginBottom: 10 }}>
          {fmtDate(schedule.window_start)} → {fmtDate(schedule.window_end)}
          {schedule.plan_pct !== null && (
            <>
              {' · '}
              <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: '#1A1A1A' }}>{schedule.elapsed_days}/{schedule.total_days}d</b>
              {' elapsed · today should be at '}
              <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: '#1A1A1A' }}>{schedule.plan_pct.toFixed(0)}%</b>
            </>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#ABABAB', marginBottom: 10 }}>No zone schedule set yet</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
            <span style={{ color: '#555555' }}>{ROW_LABEL[r.key]}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontWeight: 700, fontSize: 13, color: '#1A1A1A' }}>{r.actual.toFixed(0)}%</span>
              {schedule.plan_pct !== null && <DeltaLabel actual={r.actual} plan={schedule.plan_pct} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
