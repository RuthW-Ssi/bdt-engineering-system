import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Play, Save, BarChart2, ChevronDown, ChevronRight } from 'lucide-react'
import { getRequiredAttrs, simulateTemplate, getFixtures, createFixture } from '../api/routings'
import type { SimulateResultDTO, TestFixtureDTO } from '../api/routings'

interface SimulatorPanelProps {
  templateId: number
  templateCode: string
  productCode?: string          // pre-selected product code for "product mode"
  productAttributes?: Record<string, number>
}

const LS_KEY = (templateId: number) => `simulator_attrs_${templateId}`

export function SimulatorPanel({ templateId, templateCode, productAttributes }: SimulatorPanelProps) {
  const [mode, setMode] = useState<'product' | 'manual'>('product')
  const [manualAttrs, setManualAttrs] = useState<Record<string, string>>({})
  const [result, setResult] = useState<SimulateResultDTO | null>(null)
  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set())
  const [showSave, setShowSave] = useState(false)
  const [fixtureName, setFixtureName] = useState('')

  const { data: requiredAttrs } = useQuery({
    queryKey: ['required-attrs', templateId],
    queryFn: () => getRequiredAttrs(templateId),
  })

  const { data: fixtures, refetch: refetchFixtures } = useQuery({
    queryKey: ['fixtures', templateId],
    queryFn: () => getFixtures(templateId),
  })

  // Restore persisted manual attrs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY(templateId))
    if (saved) {
      try { setManualAttrs(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [templateId])

  const runMut = useMutation({
    mutationFn: () => {
      const attrs = resolvedAttrs()
      localStorage.setItem(LS_KEY(templateId), JSON.stringify(attrs))
      return simulateTemplate(templateId, attrs)
    },
    onSuccess: data => setResult(data),
  })

  const saveMut = useMutation({
    mutationFn: () =>
      createFixture(templateId, {
        name: fixtureName,
        source_mode: mode,
        attribute_values: resolvedAttrs(),
      }),
    onSuccess: () => {
      setShowSave(false)
      setFixtureName('')
      refetchFixtures()
    },
  })

  const resolvedAttrs = (): Record<string, number> => {
    if (mode === 'product' && productAttributes) return productAttributes
    const result: Record<string, number> = {}
    for (const [k, v] of Object.entries(manualAttrs)) {
      const n = Number(v)
      if (!isNaN(n)) result[k] = n
    }
    return result
  }

  const loadFixture = (fixture: TestFixtureDTO) => {
    const attrs: Record<string, string> = {}
    for (const [k, v] of Object.entries(fixture.attribute_values)) {
      attrs[k] = String(v)
    }
    setManualAttrs(attrs)
    setMode('manual')
  }

  const maxCycleTime = result ? Math.max(...result.operations.map(o => o.total_cycle_time_min)) : 1

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 12,
    border: '1px solid #ddd',
    borderRadius: 4,
    cursor: 'pointer',
    background: active ? '#1565c0' : '#fff',
    color: active ? '#fff' : '#333',
  })

  return (
    <div style={{ border: '1px solid #e3e8f0', borderRadius: 8, overflow: 'hidden', background: '#fafbff' }}>
      {/* Header */}
      <div
        style={{
          background: '#1565c0',
          color: '#fff',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <BarChart2 size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Simulator — {templateCode}</span>
      </div>

      <div style={{ padding: 12 }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button style={btnStyle(mode === 'product')} onClick={() => setMode('product')}>
            Product mode
          </button>
          <button style={btnStyle(mode === 'manual')} onClick={() => setMode('manual')}>
            Manual input
          </button>
        </div>

        {/* Product mode — shows auto-picked attrs */}
        {mode === 'product' && (
          <div style={{ marginBottom: 12 }}>
            {productAttributes ? (
              <div style={{ fontSize: 12, background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 4, padding: 8 }}>
                <div style={{ color: '#2e7d32', fontWeight: 600, marginBottom: 4 }}>Auto attributes from product</div>
                {Object.entries(productAttributes).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#555', minWidth: 120 }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
                Open from a product page to auto-pick attributes
              </div>
            )}
          </div>
        )}

        {/* Manual mode — editable attr inputs */}
        {mode === 'manual' && (
          <div style={{ marginBottom: 12 }}>
            {requiredAttrs && requiredAttrs.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '4px 8px', alignItems: 'center' }}>
                {requiredAttrs.map(a => (
                  <>
                    <label key={a.key + '-lbl'} style={{ fontSize: 12, color: '#555' }} title={`Used by: ${a.used_by.join(', ')}`}>
                      {a.key}
                    </label>
                    <input
                      key={a.key + '-inp'}
                      type="number"
                      step="any"
                      value={manualAttrs[a.key] ?? ''}
                      onChange={e => setManualAttrs(m => ({ ...m, [a.key]: e.target.value }))}
                      style={{ padding: '3px 6px', fontSize: 12, border: '1px solid #ddd', borderRadius: 3, width: '100%' }}
                    />
                  </>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#aaa' }}>Loading required attributes…</div>
            )}

            {/* Fixtures selector */}
            {fixtures && fixtures.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Load from fixture:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {fixtures.map(f => (
                    <button
                      key={f.id}
                      onClick={() => loadFixture(f)}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        border: '1px solid #90caf9',
                        borderRadius: 10,
                        background: '#e3f2fd',
                        cursor: 'pointer',
                        color: '#1565c0',
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Run button */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 14px',
              background: '#2e7d32',
              color: '#fff',
              border: 'none',
              borderRadius: 5,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Play size={13} /> {runMut.isPending ? 'Running…' : 'Run'}
          </button>
          {result && (
            <button
              onClick={() => setShowSave(s => !s)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                background: '#fff',
                border: '1px solid #90caf9',
                color: '#1565c0',
                borderRadius: 5,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Save size={13} /> Save as fixture
            </button>
          )}
        </div>

        {/* Save fixture form */}
        {showSave && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              value={fixtureName}
              onChange={e => setFixtureName(e.target.value)}
              placeholder="Fixture name…"
              style={{ flex: 1, padding: '4px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 4 }}
            />
            <button
              onClick={() => saveMut.mutate()}
              disabled={!fixtureName.trim() || saveMut.isPending}
              style={{
                padding: '4px 12px',
                background: '#1565c0',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                padding: '6px 8px',
                background: '#e8f5e9',
                borderRadius: 4,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>Total: {result.total_cycle_time_min.toFixed(1)} min</span>
              <span style={{ fontSize: 11, color: '#888' }}>{new Date(result.simulated_at).toLocaleTimeString('th-TH')}</span>
            </div>

            {result.operations.map(op => {
              const pct = maxCycleTime > 0 ? (op.total_cycle_time_min / maxCycleTime) * 100 : 0
              const isExpanded = expandedOps.has(op.routing_workcenter_id)
              return (
                <div key={op.routing_workcenter_id} style={{ marginBottom: 6 }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    onClick={() =>
                      setExpandedOps(s => {
                        const n = new Set(s)
                        n.has(op.routing_workcenter_id) ? n.delete(op.routing_workcenter_id) : n.add(op.routing_workcenter_id)
                        return n
                      })
                    }
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span style={{ fontSize: 12, fontWeight: 600, minWidth: 100 }}>{op.op_code}</span>
                    <div style={{ flex: 1, height: 14, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: pct === 100 ? '#c62828' : '#1565c0',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                      {op.total_cycle_time_min.toFixed(1)} min
                    </span>
                  </div>
                  {isExpanded && (
                    <div style={{ marginLeft: 20, marginTop: 4 }}>
                      {op.activities.map((a, i) => (
                        <div
                          key={i}
                          style={{ fontSize: 11, color: '#555', display: 'flex', gap: 8, padding: '1px 0' }}
                        >
                          <span style={{ color: '#888', minWidth: 160 }}>{a.description}</span>
                          <span>input={a.input_value.toFixed(2)}</span>
                          <span>→ {a.cycle_time_min.toFixed(1)} min</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
