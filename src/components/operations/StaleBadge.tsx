interface StaleBadgeProps {
  stale: boolean
  onClick?: () => void
}

export default function StaleBadge({ stale, onClick }: StaleBadgeProps) {
  if (!stale) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Library updated since snapshot"
      style={{
        fontSize: 9, fontWeight: 700, borderRadius: 4,
        padding: '2px 6px', cursor: onClick ? 'pointer' : 'default',
        background: '#FFF3E0', color: '#E65100', border: '1px solid #FFE082',
      }}
      title="Library updated since snapshot — click to review"
    >
      ⚠ STALE
    </button>
  )
}
