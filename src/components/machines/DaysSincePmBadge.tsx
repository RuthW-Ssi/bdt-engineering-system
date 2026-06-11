interface Props {
  days: number | null
}

export function DaysSincePmBadge({ days }: Props) {
  if (days === null) {
    return (
      <span style={{ color: '#9ca3af', fontSize: 12 }}>ไม่มีข้อมูล</span>
    )
  }

  const color = days < 30 ? '#16a34a' : days < 60 ? '#d97706' : '#dc2626'
  const bg = days < 30 ? '#dcfce7' : days < 60 ? '#fef3c7' : '#fee2e2'

  return (
    <span
      style={{
        background: bg,
        color,
        borderRadius: 999,
        padding: '1px 8px',
        fontSize: 11,
        fontWeight: 600,
        display: 'inline-block',
      }}
    >
      {days} วัน
    </span>
  )
}
