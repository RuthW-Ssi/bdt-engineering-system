import type { MatchStatus } from '../../api/dispatches'

const BADGE_CONFIG: Record<MatchStatus, { bg: string; text: string; label: string }> = {
  MATCHED_STANDARD: { bg: '#EAF3DE', text: '#27500A', label: 'Standard' },
  MATCHED_CUSTOM:   { bg: '#E6F1FB', text: '#0C447C', label: 'Custom' },
}

interface Props {
  status: MatchStatus | null
  size?: 'sm' | 'xs'
}

export function MatchStatusBadge({ status, size = 'sm' }: Props) {
  const cfg = status ? BADGE_CONFIG[status] : null
  const pad = size === 'xs' ? '1px 6px' : '2px 8px'
  const fontSize = size === 'xs' ? 10 : 11

  if (!cfg) {
    return (
      <span style={{ background: '#F5F5F5', color: '#8E8E8E', borderRadius: 4, padding: pad, fontSize, fontWeight: 500 }}>
        None
      </span>
    )
  }

  return (
    <span style={{ background: cfg.bg, color: cfg.text, borderRadius: 4, padding: pad, fontSize, fontWeight: 500 }}>
      {cfg.label}
    </span>
  )
}
