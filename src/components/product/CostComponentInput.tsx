interface Props {
  values: {
    cost_raw_material: string
    cost_transport: string
    cost_production: string
    cost_warehouse: string
  }
  onChange: (field: string, value: string) => void
}

const FIELDS = [
  { key: 'cost_raw_material', label: 'Raw Material' },
  { key: 'cost_transport', label: 'Transport' },
  { key: 'cost_production', label: 'Production' },
  { key: 'cost_warehouse', label: 'Warehouse' },
]

export function CostComponentInput({ values, onChange }: Props) {
  const total = FIELDS.reduce((sum, f) => {
    const val = parseFloat(values[f.key as keyof typeof values] || '0')
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Cost Components (THB)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        {FIELDS.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 500, color: '#8E8E8E', display: 'block', marginBottom: 2 }}>
              {f.label}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border rounded-md focus:outline-none font-mono"
              style={{ height: 32, padding: '0 8px', fontSize: 13, borderColor: '#E0E0E0' }}
              value={values[f.key as keyof typeof values]}
              onChange={e => onChange(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg" style={{ marginTop: 8, padding: '8px 12px', background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Standard Cost Total</span>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#1F1F1F' }}>
          {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB
        </span>
      </div>
    </div>
  )
}
