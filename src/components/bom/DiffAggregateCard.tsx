import type { DiffAggregateDto, DiffMetricDto, DiffChangesDto } from '../../api/dispatches'

function fmt(v: number | null, isFloat: boolean): string {
  if (v == null) return '—'
  const rounded = isFloat ? v : Math.round(v)
  return isFloat
    ? Number(rounded).toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : Number(rounded).toLocaleString('en')
}

// ─── Continuous metric card (Weight / Area) ──────────────────────────────────

function ContinuousCard({ label, metric, unit }: { label: string; metric: DiffMetricDto; unit: string }) {
  const { prev, curr, delta } = metric
  const hasData = curr != null || prev != null

  const direction = delta == null || delta === 0 ? 'neutral' : delta > 0 ? 'up' : 'down'
  const dc = {
    up:      { color: '#065F46', bg: '#D1FAE5', arrow: '▲' },
    down:    { color: '#991B1B', bg: '#FEE2E2', arrow: '▼' },
    neutral: { color: '#6B7280', bg: '#F3F4F6', arrow: '—' },
  }[direction]

  const pct = prev != null && prev !== 0 && delta != null ? (delta / Math.abs(prev)) * 100 : null

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{hasData ? fmt(curr, true) : '—'}</span>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>{unit}</span>
      </div>
      {delta != null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: dc.color, background: dc.bg, borderRadius: 6, padding: '3px 8px' }}>
            {dc.arrow} {delta > 0 ? '+' : ''}{fmt(delta, true)} {unit}
          </span>
          {pct != null && <span style={{ fontSize: 11, color: '#9CA3AF' }}>({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
        </div>
      ) : (
        <span style={{ fontSize: 12, color: '#D1D5DB' }}>— No previous data</span>
      )}
      {prev != null && (
        <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 8, marginTop: 3, fontSize: 11, color: '#9CA3AF' }}>
          Previous: <span style={{ fontWeight: 600 }}>{fmt(prev, true)} {unit}</span>
        </div>
      )}
    </div>
  )
}

// ─── Count card (Assembly / Standalone Parts) ────────────────────────────────

function CountCard({ label, subtitle, metric, unit, changes }: {
  label: string
  subtitle?: string
  metric: DiffMetricDto
  unit: string
  changes: DiffChangesDto
}) {
  const { prev, curr } = metric
  const hasAnyChange = changes.added > 0 || changes.removed > 0 || changes.changed > 0

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        {subtitle && <span style={{ fontSize: 11, color: '#D1D5DB' }}>· {subtitle}</span>}
      </div>

      {/* Current value */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{fmt(curr, false)}</span>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>{unit}</span>
      </div>

      {/* Changes chips — the real story */}
      {hasAnyChange ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {changes.added > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#065F46', background: '#D1FAE5', borderRadius: 6, padding: '3px 9px' }}>+{changes.added} added</span>
          )}
          {changes.removed > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', background: '#FEE2E2', borderRadius: 6, padding: '3px 9px' }}>-{changes.removed} removed</span>
          )}
          {changes.changed > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '3px 9px' }}>~{changes.changed} changed</span>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>No changes</span>
      )}

      {prev != null && (
        <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 8, marginTop: 3, fontSize: 11, color: '#9CA3AF' }}>
          Previous: <span style={{ fontWeight: 600 }}>{fmt(prev, false)} {unit}</span>
        </div>
      )}
    </div>
  )
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function DiffAggregateCard({ aggregate }: { aggregate: DiffAggregateDto }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <ContinuousCard label="Total Weight" metric={aggregate.weight_kg} unit="kg" />
      <ContinuousCard label="Surface Area"  metric={aggregate.area_m2}   unit="m²" />
      <CountCard label="Assembly"         metric={aggregate.assembly_count} unit="items" changes={aggregate.assembly_changes} />
      <CountCard label="Total Parts" metric={aggregate.part_total} unit="items" changes={aggregate.part_changes} />
    </div>
  )
}
