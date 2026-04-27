import * as Icons from 'lucide-react'
import { OP_META } from '../../data/meta'
import type { OpCode } from '../../types'

interface Props {
  op: OpCode
}

export function OpBadge({ op }: Props) {
  const m = OP_META[op]
  const c = m.color
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[m.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined

  return (
    <span
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}30` }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-semibold whitespace-nowrap"
    >
      {Icon && <Icon size={14} color={c} />}
      {m.label}
    </span>
  )
}
