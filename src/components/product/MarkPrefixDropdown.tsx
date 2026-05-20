import { useMarkPrefixes } from '../../hooks/useMarkPrefixes'
import type { MarkPrefixDTO } from '../../api/types'

interface Props {
  value: string
  onChange: (code: string) => void
  error?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  assembly: 'Assembly',
  member: 'Member',
  other: 'Other',
  sub_component: 'Sub-component',
  plate_part: 'Plate Part',
}

export function MarkPrefixDropdown({ value, onChange, error }: Props) {
  const { data: prefixes = [], isLoading } = useMarkPrefixes()

  // Group by category
  const grouped = prefixes.reduce<Record<string, MarkPrefixDTO[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p)
    return acc
  }, {})

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
        Mark Prefix *
      </label>
      <select
        className="w-full border rounded-md focus:outline-none"
        style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: error ? '#C8202A' : '#E0E0E0' }}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={isLoading}
      >
        <option value="">— Select Mark Prefix —</option>
        {Object.entries(grouped).map(([cat, items]) => (
          <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
            {items.map(p => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{error}</div>}
    </div>
  )
}
