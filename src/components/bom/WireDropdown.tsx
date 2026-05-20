import { useWireMaterials } from '../../hooks/useWelding'

interface Props {
  value: number | null
  onChange: (materialId: number | null) => void
  disabled?: boolean
}

export function WireDropdown({ value, onChange, disabled }: Props) {
  const { data: materials = [], isLoading } = useWireMaterials()

  return (
    <select
      value={value ?? ''}
      disabled={disabled || isLoading}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      style={{ fontSize: 11, padding: '2px 3px', borderRadius: 4, border: '1px solid #D9D9D9', width: '100%', background: disabled ? '#F5F5F5' : '#fff', color: disabled ? '#AAAAAA' : '#1A1A1A' }}
    >
      <option value="">— Skip —</option>
      {materials.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  )
}
