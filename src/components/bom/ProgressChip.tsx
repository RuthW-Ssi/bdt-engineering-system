interface Props {
  hasPrevious: boolean
}

export function ProgressChip({ hasPrevious }: Props) {
  if (!hasPrevious) return null
  return (
    <span style={{
      background: '#EFF6FF', color: '#1D4ED8',
      borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.01em',
    }}>
      prev → latest
    </span>
  )
}
