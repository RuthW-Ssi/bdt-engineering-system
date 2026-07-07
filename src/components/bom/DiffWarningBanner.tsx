interface Props {
  warning: string | null
}

export function DiffWarningBanner({ warning }: Props) {
  if (!warning) return null
  return (
    <div style={{
      background: '#FFFBEB',
      border: '1px solid #FDE68A',
      borderRadius: 10,
      padding: '12px 16px',
      fontSize: 13,
      color: '#92400E',
      flexShrink: 0,
    }}>
      ⚠ {warning}
    </div>
  )
}
