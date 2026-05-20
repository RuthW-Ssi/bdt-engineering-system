import type { ProductState } from '../../api/types'
import { PRODUCT_STATE_LABELS, PRODUCT_STATE_COLORS } from '../../api/types'

export function ProductStatePill({ state }: { state: ProductState }) {
  const colors = PRODUCT_STATE_COLORS[state] ?? { bg: '#F5F5F5', text: '#555555' }
  const label = PRODUCT_STATE_LABELS[state] ?? state
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
