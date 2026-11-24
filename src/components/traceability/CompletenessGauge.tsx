// Half-circle gauge for the traceability completeness of a project.
// Colour follows the share: red below 50 %, amber below 100 %, green at 100 %.
export function gaugeColor(pct: number | null): string {
  if (pct == null) return '#9CA3AF'
  if (pct >= 100) return '#15803D'
  if (pct >= 50) return '#B45309'
  return '#C8202A'
}

export function CompletenessGauge({ pct, label, sub, size = 200 }: { pct: number | null; label: string; sub?: string; size?: number }) {
  const r = 80, cx = 100, cy = 100
  const len = Math.PI * r // length of the half circle
  const share = pct == null ? 0 : Math.max(0, Math.min(100, pct)) / 100
  const color = gaugeColor(pct)
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  return (
    <div style={{ width: size, textAlign: 'center' }}>
      <svg viewBox="0 0 200 116" width={size} role="img" aria-label={`${label}: ${pct == null ? 'no data' : `${pct}%`}`}>
        <path d={arc} fill="none" stroke="#F0F0F0" strokeWidth={16} strokeLinecap="round" />
        {share > 0 && (
          <path d={arc} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round"
            strokeDasharray={`${len * share} ${len}`} />
        )}
        <text x={cx} y={92} textAnchor="middle" style={{ fontSize: 34, fontWeight: 700, fill: color }}>
          {pct == null ? '—' : `${pct.toLocaleString('en', { maximumFractionDigits: 1 })}%`}
        </text>
        <text x={cx} y={112} textAnchor="middle" style={{ fontSize: 11, fill: '#6B7280' }}>{label}</text>
      </svg>
      {sub && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
