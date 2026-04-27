import * as Icons from 'lucide-react'
import { CAT_META } from '../../data/meta'
import type { Category } from '../../types'

interface Props {
  category: Category
}

export function CatBadge({ category }: Props) {
  const m = CAT_META[category] ?? { color: '#8E8E8E', icon: 'Box' }
  const c = m.color
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[m.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined

  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 500, color: c }}>
      <span
        style={{ width: 16, height: 16, borderRadius: 999, background: `${c}18` }}
        className="inline-flex items-center justify-center shrink-0"
      >
        {Icon && <Icon size={10} color={c} />}
      </span>
      {category}
    </span>
  )
}
