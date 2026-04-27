import { PRODUCT_STATUS_META } from '../../data/meta'
import type { ProductStatus } from '../../types'

export function ProductStatusPill({ status }: { status: ProductStatus }) {
  const m = PRODUCT_STATUS_META[status]
  return (
    <span
      style={{ background: m.bg, color: m.text, border: `1px solid ${m.border}`, fontSize: 11 }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
    >
      {m.label}
    </span>
  )
}
