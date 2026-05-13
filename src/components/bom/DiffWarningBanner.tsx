interface Props {
  warning: string | null
}

export function DiffWarningBanner({ warning }: Props) {
  if (!warning) return null
  return (
    <div style={{
      background: '#FFFBEB',
      borderBottom: '1px solid #FDE68A',
      padding: '8px 24px',
      fontSize: 12,
      color: '#92400E',
      flexShrink: 0,
    }}>
      ⚠ {warning}
    </div>
  )
}
