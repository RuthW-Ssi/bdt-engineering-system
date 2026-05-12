interface Props {
  count: number
  total?: number
}

export function ProgressChip({ count, total = 3 }: Props) {
  const full = count >= total
  return (
    <span style={{
      background: full ? '#D1F2E0' : '#FEF3C7',
      color: full ? '#065F46' : '#B45309',
      borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>
      {count}/{total} {full ? '✓' : '⚠'}
    </span>
  )
}
