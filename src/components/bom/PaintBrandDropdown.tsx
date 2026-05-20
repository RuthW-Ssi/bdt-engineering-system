import { usePaintMaterials } from '../../hooks/usePaint'
import type { PaintType } from '../../api/paint'

interface Props {
  paintType: PaintType
  value: number | null
  onChange: (materialId: number | null) => void
  disabled?: boolean
}

export function PaintBrandDropdown({ paintType, value, onChange, disabled }: Props) {
  const { data: materials = [], isLoading } = usePaintMaterials(paintType)

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      disabled={disabled || isLoading}
      style={{
        width: '100%',
        fontSize: 11,
        padding: '2px 3px',
        border: '1px solid #D9D9D9',
        borderRadius: 4,
        background: disabled ? '#F5F5F5' : '#fff',
        color: value ? '#1A1A1A' : '#8E8E8E',
      }}
    >
      <option value="">— Skip —</option>
      {materials.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  )
}
