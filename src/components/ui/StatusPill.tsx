import { STATUS_META } from '../../data/meta'
import type { RoutingStatus } from '../../types'

interface Props {
  status: RoutingStatus
  size?: 'sm' | 'md'
}

export function StatusPill({ status, size = 'sm' }: Props) {
  const m = STATUS_META[status]
  return (
    <span
      style={{
        background: m.bg,
        color: m.text,
        border: `1px solid ${m.border}`,
        fontSize: size === 'md' ? 13 : 11,
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
    >
      {m.label}
    </span>
  )
}
