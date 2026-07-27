import type { DiffAggregateDto, DiffMetricDto, DiffChangesDto } from '../../api/dispatches'

function fmt(v: number | null, isFloat: boolean): string {
  if (v == null) return '—'
  const rounded = isFloat ? v : Math.round(v)
  return isFloat
    ? Number(rounded).toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : Number(rounded).toLocaleString('en')
}

const LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }
const VALUE: React.CSSProperties = { fontSize: 19, fontWeight: 700, color: '#111827', lineHeight: 1 }
const UNIT: React.CSSProperties = { fontSize: 11, color: '#9CA3AF' }
const PREV: React.CSSProperties = { fontSize: 10, color: '#B9BEC6' }

// ─── Continuous metric (Weight / Area) ───────────────────────────────────────

function ContinuousStat({ label, metric, unit }: { label: string; metric: DiffMetricDto; unit: string }) {
  const { prev, curr, delta } = metric
  const direction = delta == null || delta === 0 ? 'neutral' : delta > 0 ? 'up' : 'down'
  const dc = {
    up:      { color: '#065F46', bg: '#D1FAE5', arrow: '▲' },
    down:    { color: '#991B1B', bg: '#FEE2E2', arrow: '▼' },
    neutral: { color: '#6B7280', bg: '#F3F4F6', arrow: '—' },
  }[direction]
  const pct = prev != null && prev !== 0 && delta != null ? (delta / Math.abs(prev)) * 100 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={LABEL}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={VALUE}>{curr != null || prev != null ? fmt(curr, true) : '—'}</span>
        <span style={UNIT}>{unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {delta != null ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: dc.color, background: dc.bg, borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>
            {dc.arrow} {delta > 0 ? '+' : ''}{fmt(delta, true)}{pct != null && ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`}
          </span>
        ) : (
          <span style={PREV}>no previous data</span>
        )}
        {prev != null && <span style={PREV}>prev {fmt(prev, true)}</span>}
      </div>
    </div>
  )
}

// ─── Count metric (Assemblies / Parts) ───────────────────────────────────────

function CountStat({ label, metric, changes }: { label: string; metric: DiffMetricDto; changes: DiffChangesDto }) {
  const { prev, curr } = metric
  const hasAnyChange = changes.added > 0 || changes.removed > 0 || changes.changed > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={LABEL}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={VALUE}>{fmt(curr, false)}</span>
        <span style={UNIT}>items</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {/* +N / −N / ~N — same symbols as the table legend below, no words */}
        {hasAnyChange ? (
          <>
            {changes.added > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 5, padding: '2px 6px' }}>+{changes.added}</span>}
            {changes.removed > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', borderRadius: 5, padding: '2px 6px' }}>-{changes.removed}</span>}
            {changes.changed > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 5, padding: '2px 6px' }}>~{changes.changed}</span>}
          </>
        ) : (
          <span style={PREV}>no changes</span>
        )}
        {prev != null && <span style={PREV}>prev {fmt(prev, false)}</span>}
      </div>
    </div>
  )
}

// ─── Export ──────────────────────────────────────────────────────────────────

// One compact strip instead of four tall cards — this sits in the narrow
// left column of the diff page (3D panel owns the right half), so vertical
// economy and glanceability beat big-number presentation.
export function DiffAggregateCard({ aggregate }: { aggregate: DiffAggregateDto }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px 20px', flexShrink: 0 }}>
      <ContinuousStat label="Total Weight" metric={aggregate.weight_kg} unit="kg" />
      <ContinuousStat label="Surface Area" metric={aggregate.area_m2} unit="m²" />
      <CountStat label="Assemblies" metric={aggregate.assembly_count} changes={aggregate.assembly_changes} />
      <CountStat label="Parts" metric={aggregate.part_total} changes={aggregate.part_changes} />
    </div>
  )
}
