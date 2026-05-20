import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import type { WeldingMbomSummaryDto, WeldingMbomItemDto } from '../../api/welding'

// ─── Option A: Formula reference box ────────────────────────────────────────

function WeldingFormulaBox({ item }: { item: WeldingMbomItemDto }) {
  const [open, setOpen] = useState(false)

  // pick representative spec (first row, or most common)
  const first = item.assembly_breakdown[0]
  const fillet = first?.fillet_mm ?? 6
  const sides = first?.sides ?? 2
  const layers = first?.weld_layers ?? 1
  const rate = first?.rate_kg_per_m ?? 0.314
  const allSameSpec = item.assembly_breakdown.every(
    r => r.fillet_mm === fillet && r.sides === sides && r.weld_layers === layers,
  )

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
      >
        <Info size={11} />
        How is this calculated?
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {open && (
        <div style={{ background: '#F7FBFF', border: '1px solid #DBEAFE', borderRadius: 5, padding: '10px 14px', marginTop: 4, fontSize: 12, color: '#444' }}>
          <div style={{ fontWeight: 700, color: '#1A1A1A', marginBottom: 6 }}>Welding wire consumption formula</div>

          <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#DBEAFE', borderRadius: 4, padding: '6px 10px', marginBottom: 8, color: '#1E3A5F', lineHeight: 1.6 }}>
            <div>rate = (fillet² / 200) × 100 × sides × layers × 7.85 / 0.90 / 1000</div>
            <div>consumption = (path_m + tack_welds × 0.05) × rate × asm_qty</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            {[
              { label: 'Fillet', value: `${fillet} mm` },
              { label: 'Sides', value: `${sides}` },
              { label: 'Layers', value: `${layers}` },
              { label: 'Rate', value: `${rate} kg/m` },
            ].map(p => (
              <div key={p.label} style={{ background: '#fff', border: '1px solid #DBEAFE', borderRadius: 4, padding: '5px 8px' }}>
                <div style={{ fontSize: 10, color: '#8E8E8E' }}>{p.label}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.value}</div>
              </div>
            ))}
          </div>

          {!allSameSpec && (
            <div style={{ fontSize: 11, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 4, padding: '4px 8px' }}>
              Spec varies per assembly — see breakdown for individual values
            </div>
          )}

          <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
            Example: fillet {fillet}mm, {sides} sides, {layers} layer → rate = {rate} kg/m
            <br />
            Tack weld allowance: 1 tack per 500 mm + 4 end tacks (50 mm each)
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Option C: Per-assembly spec breakdown ───────────────────────────────────

function AssemblySpecTable({ item }: { item: WeldingMbomItemDto }) {
  if (item.assembly_breakdown.length === 0) return null
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed #DBEAFE', paddingTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        Assembly specs
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#EFF6FF' }}>
            <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600, color: '#1E40AF', fontSize: 10 }}>Assembly</th>
            <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600, color: '#1E40AF', fontSize: 10 }}>Qty</th>
            <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600, color: '#1E40AF', fontSize: 10 }}>Fillet</th>
            <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600, color: '#1E40AF', fontSize: 10 }}>Sides</th>
            <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600, color: '#1E40AF', fontSize: 10 }}>Layers</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600, color: '#1E40AF', fontSize: 10 }}>Rate (kg/m)</th>
          </tr>
        </thead>
        <tbody>
          {item.assembly_breakdown.map(row => (
            <tr key={row.assembly_id} style={{ borderBottom: '1px solid #EFF6FF' }}>
              <td style={{ padding: '3px 6px', fontFamily: 'monospace', color: '#333' }}>{row.assembly_mark}</td>
              <td style={{ padding: '3px 6px', textAlign: 'center', color: '#888' }}>×{row.asm_qty}</td>
              <td style={{ padding: '3px 6px', textAlign: 'center', color: '#555' }}>{row.fillet_mm} mm</td>
              <td style={{ padding: '3px 6px', textAlign: 'center', color: '#555' }}>{row.sides}</td>
              <td style={{ padding: '3px 6px', textAlign: 'center', color: '#555' }}>{row.weld_layers}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 500, color: '#1E40AF' }}>{row.rate_kg_per_m}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  dispatchId: number
  data: WeldingMbomSummaryDto | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function WeldingMaterialsTable({ dispatchId, data, isLoading, isError, onRetry }: Props) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        {[1, 2].map(i => (
          <div key={i} style={{ marginBottom: 12, border: '1px solid #E8E8E8', borderRadius: 6, padding: 12 }}>
            <div style={{ height: 14, width: 160, background: '#F0F0F0', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 32, background: '#F5F5F5', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '16px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Failed to load welding mBOM</div>
        <button onClick={onRetry} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid #D9D9D9', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div style={{ padding: '16px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>No welding config yet</div>
        <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 12 }}>Configure wire first to compute</div>
        <button
          onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer' }}
        >
          Configure Welding
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 24px 16px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
          Welding Wire
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>
            Computed at {data.computed_at ? new Date(data.computed_at).toLocaleString('en-GB') : '—'}
          </span>
          <button
            onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid #2563EB', color: '#2563EB', background: '#fff', cursor: 'pointer' }}
          >
            Reconfigure Wire
          </button>
        </div>
      </div>

      {/* Material cards */}
      {data.items.map(item => {
        const isOpen = expanded.has(item.material_id)
        const hasBreakdown = item.assembly_breakdown.length > 0
        return (
          <div key={item.material_id} style={{ marginBottom: 12, border: '1px solid #E8E8E8', borderRadius: 6, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ background: '#F5F8FF', padding: '8px 12px', borderBottom: '1px solid #E8E8E8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#1A1A1A', background: '#E8E8E8', padding: '1px 6px', borderRadius: 3 }}>
                    {item.default_code}
                  </span>
                  <span style={{ fontSize: 10, color: '#2563EB', background: '#DBEAFE', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>
                    welding_wire
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{item.material_name}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#8E8E8E' }}>
                <div>UOM</div>
                <div style={{ fontWeight: 600, color: '#555' }}>{item.uom ?? 'EA'}</div>
              </div>
            </div>

            {/* Metrics row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 0', background: '#fff' }}>
              <div style={{ padding: '4px 12px', borderRight: '1px solid #F0F0F0' }}>
                <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>welding_path_m</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{item.total_path_m.toFixed(3)}</div>
                <div style={{ fontSize: 10, color: '#8E8E8E' }}>m</div>
              </div>
              <div style={{ padding: '4px 12px', borderRight: '1px solid #F0F0F0' }}>
                <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>consumption</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{item.total_consumption_kg.toFixed(3)}</div>
                <div style={{ fontSize: 10, color: '#8E8E8E' }}>kg</div>
              </div>
              <div style={{ padding: '4px 12px' }}>
                <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>packages</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>{item.total_packages}</div>
                <div style={{ fontSize: 10, color: '#8E8E8E' }}>box</div>
              </div>
            </div>

            {/* Option C toggle + Option A formula */}
            {hasBreakdown && (
              <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #F0F0F0', background: '#FAFCFF' }}>
                <button
                  onClick={() => toggle(item.material_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: 600 }}
                >
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {isOpen ? 'Hide' : 'Show'} assembly breakdown ({item.assembly_breakdown.length})
                </button>
                {isOpen && <AssemblySpecTable item={item} />}
                <WeldingFormulaBox item={item} />
              </div>
            )}
          </div>
        )
      })}

      {/* Grand total */}
      <div style={{ borderTop: '2px solid #1A1A1A', paddingTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
        <span style={{ fontSize: 13, color: '#555' }}>
          Total consumption: <strong>{data.grand_total_consumption_kg.toFixed(3)} kg</strong>
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>
          {data.grand_total_packages} packages
        </span>
      </div>
    </div>
  )
}
