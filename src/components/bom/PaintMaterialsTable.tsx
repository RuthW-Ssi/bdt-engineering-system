import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import type { MbomSummaryDto, MbomMaterialItemDto, PaintType } from '../../api/paint'

const PAINT_LABELS: Record<PaintType, string> = {
  primer: 'Primer',
  intermediate: 'Intermediate',
  fireproof: 'Fireproof',
  topcoat: 'Topcoat',
}

const PAINT_COLORS: Record<PaintType, { bg: string; text: string; border: string }> = {
  primer:       { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
  intermediate: { bg: '#F0FDF4', text: '#15803D', border: '#86EFAC' },
  fireproof:    { bg: '#FFF1F2', text: '#BE123C', border: '#FDA4AF' },
  topcoat:      { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD' },
}

// ─── Option A: Formula reference box ────────────────────────────────────────

function PaintFormulaBox({ item }: { item: MbomMaterialItemDto }) {
  const [open, setOpen] = useState(false)
  const exampleArea = item.assembly_breakdown[0]?.area_m2?.toFixed(3) ?? '—'
  const exampleLayers = item.assembly_breakdown[0]?.layers ?? 1
  const exampleGal = item.assembly_breakdown[0]?.gallons?.toFixed(3) ?? '—'

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
        <div style={{ background: '#F8F9FC', border: '1px solid #E4E8F0', borderRadius: 5, padding: '10px 14px', marginTop: 4, fontSize: 12, color: '#444' }}>
          <div style={{ fontWeight: 700, color: '#1A1A1A', marginBottom: 6 }}>Paint quantity formula</div>

          <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#EEF1F8', borderRadius: 4, padding: '6px 10px', marginBottom: 8, color: '#1A3A6B', lineHeight: 1.6 }}>
            <div>gallons = area_m² × layers ÷ coverage_m²/gal</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            {[
              { label: 'DFT', value: `${item.micron} µm` },
              { label: 'Coverage', value: `${item.coverage_sqm_per_gallon} m²/gal` },
              { label: 'Layers', value: 'per assembly' },
            ].map(p => (
              <div key={p.label} style={{ background: '#fff', border: '1px solid #E4E8F0', borderRadius: 4, padding: '5px 8px' }}>
                <div style={{ fontSize: 10, color: '#8E8E8E' }}>{p.label}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.value}</div>
              </div>
            ))}
          </div>

          {item.assembly_breakdown.length > 0 && (
            <div style={{ fontSize: 11, color: '#666' }}>
              Example (first assembly):&nbsp;
              <span style={{ fontFamily: 'monospace', color: '#1A3A6B' }}>
                {exampleArea} m² × {exampleLayers}L ÷ {item.coverage_sqm_per_gallon} = {exampleGal} gal
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Option C: Per-assembly spec breakdown ───────────────────────────────────

function AssemblyBreakdownTable({ item }: { item: MbomMaterialItemDto }) {
  if (item.assembly_breakdown.length === 0) return null
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed #E4E8F0', paddingTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#3B5BDB', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        Assembly specs
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#F0F4FF' }}>
            <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600, color: '#3B5BDB', fontSize: 10 }}>Assembly</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600, color: '#3B5BDB', fontSize: 10 }}>Area m²</th>
            <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600, color: '#3B5BDB', fontSize: 10 }}>Qty</th>
            <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600, color: '#3B5BDB', fontSize: 10 }}>Layers</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600, color: '#3B5BDB', fontSize: 10 }}>Gallons</th>
          </tr>
        </thead>
        <tbody>
          {item.assembly_breakdown.map(row => (
            <tr key={row.assembly_id} style={{ borderBottom: '1px solid #F0F4FF' }}>
              <td style={{ padding: '3px 6px', fontFamily: 'monospace', color: '#333' }}>{row.assembly_mark}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', color: '#555' }}>{row.area_m2.toFixed(3)}</td>
              <td style={{ padding: '3px 6px', textAlign: 'center', color: '#888' }}>×{row.qty}</td>
              <td style={{ padding: '3px 6px', textAlign: 'center', color: '#888' }}>{row.layers}L</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 500, color: '#3B5BDB' }}>{row.gallons.toFixed(3)}</td>
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
  data: MbomSummaryDto | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function PaintMaterialsTable({ dispatchId, data, isLoading, isError, onRetry }: Props) {
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
        {[1, 2, 3, 4].map(i => (
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
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Failed to load paint mBOM</div>
        <button onClick={onRetry} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid #D9D9D9', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.by_paint_type.length === 0) {
    return (
      <div style={{ padding: '16px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>No paint config for this dispatch yet</div>
        <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 12 }}>Configure paint first to compute mBOM</div>
        <button
          onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer' }}
        >
          Configure Paint
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
          Paint Materials
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>
            Computed at {data.computed_at ? new Date(data.computed_at).toLocaleString('en-GB') : '—'}
          </span>
          <button
            onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid #C8202A', color: '#C8202A', background: '#fff', cursor: 'pointer' }}
          >
            Reconfigure Paint
          </button>
        </div>
      </div>

      {/* Cards grouped by paint type */}
      {data.by_paint_type.map(group => {
        const paintType = group.paint_type as PaintType
        const colors = PAINT_COLORS[paintType] ?? PAINT_COLORS.topcoat
        return (
          <div key={group.paint_type} style={{ marginBottom: 20 }}>
            {/* Section label */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              {PAINT_LABELS[paintType] ?? group.paint_type}
            </div>

            {group.items.map(item => {
              const isOpen = expanded.has(item.material_id)
              const hasBreakdown = item.assembly_breakdown.length > 0
              return (
                <div key={item.material_id} style={{ marginBottom: 10, border: '1px solid #E8E8E8', borderRadius: 6, overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{ background: '#F5F8FF', padding: '8px 12px', borderBottom: '1px solid #E8E8E8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#1A1A1A', background: '#E8E8E8', padding: '1px 6px', borderRadius: 3 }}>
                          {item.material_name}
                        </span>
                        <span style={{ fontSize: 10, color: colors.text, background: colors.bg, border: `1px solid ${colors.border}`, padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>
                          {PAINT_LABELS[paintType] ?? paintType}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#666' }}>{item.micron} µm · {item.coverage_sqm_per_gallon} m²/gal</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11, color: '#8E8E8E' }}>
                      <div>UOM</div>
                      <div style={{ fontWeight: 600, color: '#555' }}>gal</div>
                    </div>
                  </div>

                  {/* Metrics row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 0', background: '#fff' }}>
                    <div style={{ padding: '4px 12px', borderRight: '1px solid #F0F0F0' }}>
                      <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>total_area</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{item.total_area_m2.toFixed(3)}</div>
                      <div style={{ fontSize: 10, color: '#8E8E8E' }}>m²</div>
                    </div>
                    <div style={{ padding: '4px 12px' }}>
                      <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>quantity</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#C8202A' }}>{item.total_qty_gallon.toFixed(3)}</div>
                      <div style={{ fontSize: 10, color: '#8E8E8E' }}>gal</div>
                    </div>
                  </div>

                  {/* Option C toggle + Option A formula */}
                  {hasBreakdown && (
                    <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #F0F0F0', background: '#FAFCFF' }}>
                      <button
                        onClick={() => toggle(item.material_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#3B5BDB', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: 600 }}
                      >
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {isOpen ? 'Hide' : 'Show'} assembly breakdown ({item.assembly_breakdown.length})
                      </button>
                      {isOpen && <AssemblyBreakdownTable item={item} />}
                      <PaintFormulaBox item={item} />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Subtotal per paint type */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 12, paddingTop: 4 }}>
              <span style={{ fontSize: 12, color: '#555' }}>
                Subtotal: <strong style={{ color: '#C8202A' }}>{group.subtotal_gallon.toFixed(3)} gal</strong>
              </span>
            </div>
          </div>
        )
      })}

      {/* Grand total */}
      <div style={{ borderTop: '2px solid #1A1A1A', paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          Total: {data.grand_total_gallon.toFixed(3)} gallon
        </span>
      </div>
    </div>
  )
}
