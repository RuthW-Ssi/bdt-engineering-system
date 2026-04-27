import type { ProductState } from '../../api/types'
import { PRODUCT_STATE_LABELS, PRODUCT_STATE_COLORS } from '../../api/types'

export function ProductStatePill({ state }: { state: ProductState }) {
  const colors = PRODUCT_STATE_COLORS[state]
  const label = PRODUCT_STATE_LABELS[state]
  return (
    <span style={{
      background: colors.bg, color: colors.text,
      padding: '2px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 500,
    }}>
      {label}
    </span>
  )
}
