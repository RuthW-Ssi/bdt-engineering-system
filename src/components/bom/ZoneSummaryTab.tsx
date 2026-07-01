import { useState, useEffect, Fragment } from 'react'
import { toast } from 'sonner'
import { Loader2, Package, ChevronDown, ChevronRight, Clock, FlaskConical, Cpu } from 'lucide-react'
import { getZoneSummary, type ZoneSummaryDto, type ZoneConsumableRow, type ZoneWorkcenterRow } from '../../api/routings'

const RESOURCE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  'CON-PRIMER': { label: 'Primer', color: '#92400E', bg: '#FEF3C7' },
  'CON-TOPCOAT': { label: 'Topcoat', color: '#065F46', bg: '#ECFDF5' },
  'CON-INTERMEDIATE': { label: 'Intermediate', color: '#1D4ED8', bg: '#EFF6FF' },
  'CON-FIREPROOF': { label: 'Fireproof', color: '#7C3AED', bg: '#F5F3FF' },
}
function resourceChip(code: string) {
  const info = RESOURCE_LABEL[code]
  if (!info) return null
  return <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: info.bg, color: info.color, fontWeight: 600 }}>{info.label}</span>
}

function fmt2(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en', { maximumFractionDigits: 3 })
}
function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

// ── Consumables zone table ──────────────────────────────────────

function ConsumablesZoneTable({ rows }: { rows: ZoneConsumableRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (code: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })

  if (rows.length === 0) return (
    <div style={{ padding: '12px 0', color: '#9CA3AF', fontSize: 13 }}>No consumables in applied routings</div>
  )

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: '#F5F5F5' }}>
          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Resource</th>
          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Basis</th>
          <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Total Qty</th>
          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Unit</th>
          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Assemblies</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const isOpen = expanded.has(row.resource_code)
          return (
            <Fragment key={row.resource_code}>
              <tr
                onClick={() => toggle(row.resource_code)}
                style={{ cursor: 'pointer', borderBottom: '1px solid #F0F0F0', background: isOpen ? '#FFFBEB' : '#fff' }}
              >
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isOpen ? <ChevronDown size={12} style={{ color: '#8E8E8E', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: '#8E8E8E', flexShrink: 0 }} />}
                    <span style={{ fontWeight: 600, color: '#1F1F1F' }}>{row.resource_name}</span>
                    <span style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace' }}>{row.resource_code}</span>
                    {resourceChip(row.resource_code)}
                  </div>
                </td>
                <td style={{ padding: '9px 12px', color: '#555', fontSize: 12 }}>{row.consumption_basis ?? 'per_unit'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: row.total_qty != null ? '#1F1F1F' : '#9CA3AF' }}>
                  {row.total_qty != null ? fmt2(row.total_qty) : '—'}
                </td>
                <td style={{ padding: '9px 12px', color: '#555', fontSize: 12 }}>{row.unit ?? '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'center', color: '#8E8E8E', fontSize: 12 }}>{row.breakdown.length}</td>
              </tr>
              {isOpen && row.breakdown.map((b, bi) => (
                <tr key={`${row.resource_code}-${b.assembly_mark}-${bi}`} style={{ background: '#FFFBEB', borderBottom: '1px solid #FEF9C3' }}>
                  <td style={{ padding: '6px 12px 6px 34px', color: '#B45309', fontSize: 12, fontWeight: 500 }}>{b.assembly_mark}</td>
                  <td style={{ padding: '6px 12px', color: '#92400E', fontSize: 12 }}>×{b.assembly_qty} pcs</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 12, color: '#555' }}>
                    {fmt2(b.qty_per_piece)} × {b.assembly_qty} = <strong>{fmt2(b.total_qty)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Workcenter time zone table ──────────────────────────────────

function WorkcenterZoneTable({ rows }: { rows: ZoneWorkcenterRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (code: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })

  if (rows.length === 0) return (
    <div style={{ padding: '12px 0', color: '#9CA3AF', fontSize: 13 }}>No operations in applied routings</div>
  )

  const grandTotal = rows.reduce((s, r) => s + r.total_minutes, 0)

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#F5F5F5' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Workcenter</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Total Time</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '1px solid #E0E0E0' }}>Assemblies</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const isOpen = expanded.has(row.workcenter_code)
            const pct = grandTotal > 0 ? (row.total_minutes / grandTotal) * 100 : 0
            return (
              <Fragment key={row.workcenter_code}>
                <tr
                  onClick={() => toggle(row.workcenter_code)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #F0F0F0', background: isOpen ? '#F0F4FF' : '#fff' }}
                >
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isOpen ? <ChevronDown size={12} style={{ color: '#8E8E8E', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: '#8E8E8E', flexShrink: 0 }} />}
                      <div>
                        <span style={{ fontWeight: 600, color: '#1F1F1F' }}>{row.workcenter_name}</span>
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#8E8E8E', fontFamily: 'monospace' }}>{row.workcenter_code}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 4, marginLeft: 18 }}>
                      <div style={{ height: 4, borderRadius: 2, background: '#E8E8E8', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: '#4B5EAA', borderRadius: 2 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#1F1F1F' }}>
                    {fmtMin(row.total_minutes)}
                    <div style={{ fontSize: 11, color: '#8E8E8E', fontWeight: 400 }}>{fmt2(row.total_minutes)} min</div>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: '#8E8E8E', fontSize: 12 }}>{row.breakdown.length}</td>
                </tr>
                {isOpen && row.breakdown.map((b, bi) => (
                  <tr key={`${row.workcenter_code}-${b.assembly_mark}-${bi}`} style={{ background: '#F0F4FF', borderBottom: '1px solid #DDE5FF' }}>
                    <td style={{ padding: '6px 12px 6px 34px', color: '#4B5EAA', fontSize: 12, fontWeight: 500 }}>{b.assembly_mark}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 12, color: '#555' }}>
                      {fmtMin(b.minutes_per_piece)} × {b.assembly_qty} = <strong>{fmtMin(b.total_minutes)}</strong>
                    </td>
                    <td />
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: '#555', textAlign: 'right', paddingRight: 12 }}>
        Grand total: <strong>{fmtMin(grandTotal)}</strong> ({fmt2(grandTotal)} min)
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────

export function ZoneSummaryTab({ dispatchId }: { dispatchId: number }) {
  const [data, setData] = useState<ZoneSummaryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'consumables' | 'time' | 'assemblies'>('consumables')

  useEffect(() => {
    setLoading(true)
    getZoneSummary(dispatchId)
      .then(setData)
      .catch((e: any) => {
        toast.error(e?.response?.data?.message ?? 'Failed to load zone summary — please try again')
        console.error(e)
      })
      .finally(() => setLoading(false))
  }, [dispatchId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: '#9CA3AF', fontSize: 13 }}>
      <Loader2 size={18} className="animate-spin" /> Computing zone summary...
    </div>
  )

  if (!data) return null

  if (data.applied_count === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, gap: 8 }}>
      <Package size={36} style={{ color: '#D9D9D9' }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>No applied routings yet</div>
      <div style={{ fontSize: 12, color: '#9CA3AF' }}>
        {data.total_matched} matched assembl{data.total_matched === 1 ? 'y' : 'ies'} — apply a routing template first
      </div>
    </div>
  )

  const grandTotalMin = data.workcenter_times.reduce((s, r) => s + r.total_minutes, 0)

  const TABS = [
    { id: 'consumables' as const, label: 'Consumables', icon: <FlaskConical size={13} />, count: data.consumables.length },
    { id: 'time' as const, label: 'Workcenter Time', icon: <Clock size={13} />, count: data.workcenter_times.length },
    { id: 'assemblies' as const, label: 'By Assembly', icon: <Cpu size={13} />, count: data.by_assembly.length },
  ]

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Applied', value: `${data.applied_count} / ${data.total_matched}`, color: '#065F46', bg: '#ECFDF5' },
          { label: 'Consumable types', value: String(data.consumables.length), color: '#92400E', bg: '#FEF3C7' },
          { label: 'Workcenters', value: String(data.workcenter_times.length), color: '#0C447C', bg: '#E6F1FB' },
          { label: 'Total time', value: fmtMin(grandTotalMin), color: '#4B5EAA', bg: '#F0F4FF' },
        ].map(s => (
          <div key={s.label} style={{ padding: '10px 16px', borderRadius: 8, background: s.bg, minWidth: 130 }}>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E8E8E8', marginBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', fontSize: 13, fontWeight: section === t.id ? 600 : 400,
              color: section === t.id ? '#1F1F1F' : '#8E8E8E',
              background: 'none', border: 'none',
              borderBottomWidth: 2, borderBottomStyle: 'solid',
              borderBottomColor: section === t.id ? '#1F1F1F' : 'transparent',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            <span style={{ color: section === t.id ? '#1F1F1F' : '#C2C2C2' }}>{t.icon}</span>
            {t.label}
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: section === t.id ? '#1F1F1F' : '#E8E8E8', color: section === t.id ? '#fff' : '#8E8E8E', fontWeight: 600, marginLeft: 2 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid #E8E8E8', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        {section === 'consumables' && <ConsumablesZoneTable rows={data.consumables} />}
        {section === 'time' && <WorkcenterZoneTable rows={data.workcenter_times} />}
        {section === 'assemblies' && <AssembliesSection data={data} />}
      </div>
    </div>
  )
}

// ── Assemblies breakdown section ────────────────────────────────

function AssembliesSection({ data }: { data: ZoneSummaryDto }) {
  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <div>
      {data.by_assembly.map((asm, i) => {
        const isOpen = openId === asm.assembly_id
        const totalMin = asm.workcenter_times.reduce((s, r) => s + r.total_minutes, 0)
        return (
          <div key={asm.assembly_id} style={{ borderBottom: i < data.by_assembly.length - 1 ? '1px solid #F0F0F0' : 'none' }}>
            <button
              onClick={() => setOpenId(isOpen ? null : asm.assembly_id)}
              style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: isOpen ? '#FAFAFA' : '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              {isOpen ? <ChevronDown size={13} style={{ color: '#555', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#8E8E8E', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#B45309', fontFamily: 'monospace' }}>{asm.assembly_mark}</span>
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#F3F4F6', color: '#555' }}>×{asm.assembly_qty} pcs</span>
                  {asm.template_code && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>{asm.template_code}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 11, color: '#8E8E8E' }}>
                  {asm.surface_area_m2 != null && <span>Area: {fmt2(asm.surface_area_m2)} m²</span>}
                  {asm.weight_kg != null && <span>Weight: {fmt2(asm.weight_kg)} kg</span>}
                  <span>{asm.consumables.length} consumable{asm.consumables.length !== 1 ? 's' : ''}</span>
                  <span>{fmtMin(totalMin)} total</span>
                </div>
              </div>
            </button>

            {isOpen && (
              <div style={{ padding: '0 16px 16px 40px' }}>
                {asm.consumables.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FlaskConical size={11} /> Consumables
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {asm.consumables.map(c => (
                        <div key={c.resource_code} style={{ padding: '6px 10px', borderRadius: 6, background: '#FEF9C3', border: '1px solid #FDE68A', fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: '#92400E' }}>{c.resource_name}</div>
                          <div style={{ color: '#B45309', marginTop: 1 }}>
                            {c.qty_per_piece != null ? `${fmt2(c.qty_per_piece)} × ${asm.assembly_qty} = ` : ''}
                            <strong>{fmt2(c.total_qty)}</strong> {c.unit ?? ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {asm.workcenter_times.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#4B5EAA', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> Time per Workcenter
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {asm.workcenter_times.map((wc, wi) => (
                        <div key={`${wc.workcenter_code}-${wi}`} style={{ padding: '6px 10px', borderRadius: 6, background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: '#1D4ED8' }}>{wc.workcenter_name}</div>
                          <div style={{ color: '#1E40AF', marginTop: 1 }}>
                            {fmtMin(wc.minutes_per_piece)} × {asm.assembly_qty} = <strong>{fmtMin(wc.total_minutes)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
