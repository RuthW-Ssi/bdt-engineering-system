import type { ProductType } from '../../api/types'

const META: Record<ProductType, { label: string; bg: string; text: string }> = {
  standard: { label: 'Standard', bg: '#E6F1FB', text: '#0C447C' },
  custom:   { label: 'Custom',   bg: '#FFF3E0', text: '#B45309' },
}

export function ProductTypeBadge({ type }: { type: ProductType }) {
  const m = META[type]
  return (
    <span style={{
      background: m.bg, color: m.text,
      padding: '2px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
    }}>
      {m.label}
    </span>
  )
}
