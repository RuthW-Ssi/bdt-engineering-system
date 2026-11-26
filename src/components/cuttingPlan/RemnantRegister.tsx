import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Search } from 'lucide-react'
import type { CuttingPlanRemnant } from '../../api/cutting-plan'
import { usePrices, useRemnants, useRemnantUse } from '../../hooks/useCuttingPlan'
import { usePermission } from '../../hooks/usePermission'
import { priceFor, thb } from '../../lib/cuttingPlan/plateMaterial'
import { shapeKgPerM } from '../../lib/cuttingPlan/shapeMaterial'
import { getErrorMessage } from '../../lib/getErrorMessage'

// User test report 2026-11-26: the remnant database for reuse (Plate and Shape — production side). Every plate
// remnant and every shape rest of the stored plans is in it (Tao: keep whatever is left); "Use" takes pieces out
// (who, when, how many, note), the rest stays available.
const fmt = (v: number | null | undefined, d = 0) => (v == null ? '—' : v.toLocaleString('en', { maximumFractionDigits: d }))

export function RemnantRegister() {
  const navigate = useNavigate()
  const remnants = useRemnants(), prices = usePrices()
  const canWrite = usePermission('cutting-plan', 'update')
  const use = useRemnantUse()
  const [kind, setKind] = useState<'ALL' | 'PLATE' | 'SHAPE'>('ALL')
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [q, setQ] = useState('')
  const [using, setUsing] = useState<CuttingPlanRemnant | null>(null)
  const [qty, setQty] = useState('1'), [note, setNote] = useState('')

  const kgOf = (r: CuttingPlanRemnant) => (r.kind === 'PLATE' ? r.weight_kg : r.profile && r.length_mm != null ? ((shapeKgPerM(r.profile) ?? 0) * r.length_mm) / 1000 : null)
  const valueOf = (r: CuttingPlanRemnant) => { const p = r.kind === 'PLATE' ? priceFor(prices.data, r.grade, r.thick_mm) : null; const k = kgOf(r); return p == null || k == null ? null : p * k }
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (remnants.data ?? []).filter(r => (kind === 'ALL' || r.kind === kind) && (!onlyAvailable || r.available > 0)
      && (!s || [r.offcut_no, r.from_plate, r.profile, r.grade, r.project_code, r.zone, r.certificate].some(v => (v ?? '').toLowerCase().includes(s))))
  }, [remnants.data, kind, onlyAvailable, q])
  const avail = rows.reduce((n, r) => n + r.available, 0)
  const availKg = rows.reduce((n, r) => n + (kgOf(r) ?? 0) * r.available, 0)
  const availValue = rows.reduce((n, r) => n + (valueOf(r) ?? 0) * r.available, 0)

  const submitUse = async () => {
    if (!using) return
    const n = Number(qty)
    if (!(Number.isInteger(n) && n >= 1 && n <= using.available)) { toast.error(`Pieces: 1 to ${using.available}`); return }
    try { await use.mutateAsync({ source: using.source, source_id: using.source_id, qty: n, note: note.trim() || undefined }); toast.success(`${n} × ${using.offcut_no} taken out`); setUsing(null) } catch (e) { toast.error(getErrorMessage(e, 'Could not take the remnant out')) }
  }
  const seg = (on: boolean) => ({ height: 30, padding: '0 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: on ? '#1F2937' : 'white', color: on ? 'white' : '#555' }) as const
  const td = { padding: '8px 12px', whiteSpace: 'nowrap' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden' }}>
          {(['ALL', 'PLATE', 'SHAPE'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)} style={seg(kind === k)}>{k === 'ALL' ? 'All' : k === 'PLATE' ? 'Plate' : 'Shape'}</button>)}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
          <input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} />Available only
        </label>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input aria-label="Search remnants" value={q} onChange={e => setQ(e.target.value)} placeholder="Offcut no., size, grade, project, certificate"
            style={{ height: 32, padding: '0 10px 0 30px', fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 6, width: 320 }} />
        </div>
        <span data-testid="remnant-total" style={{ marginLeft: 'auto', fontSize: 12, color: '#555' }}>
          Available <b>{fmt(avail)}</b> pcs · <b>{fmt(availKg, 1)}</b> kg{availValue > 0 ? <> · <b>{thb(availValue)}</b></> : null}
        </span>
      </div>

      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'auto' }}>
        {remnants.isLoading ? <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><Loader2 className="animate-spin" size={18} /></div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 11 }}>
              {['Offcut No.', 'Type', 'Size', 'Grade', 'Weight (kg)', 'Value', 'Qty', 'Used', 'Available', 'Material certificate', 'From', ''].map(h => <th key={h} style={{ ...td, fontWeight: 500 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.slice(0, 500).map(r => (
                <tr key={`${r.source}|${r.source_id}`} style={{ borderTop: '1px solid #F3F4F6', color: r.available ? '#1F1F1F' : '#9CA3AF' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.offcut_no}</td>
                  <td style={td}>{r.kind === 'PLATE' ? 'Plate' : 'Shape'}</td>
                  <td style={td}>{r.kind === 'PLATE' ? `${fmt(r.thick_mm, 1)} × ${fmt(r.width_mm)} × ${fmt(r.length_mm)} mm` : `${r.profile} · ${fmt(r.length_mm, 2)} mm`}{r.from_plate ? <span style={{ color: '#9CA3AF' }}>{` · plate ${r.from_plate}`}</span> : null}</td>
                  <td style={td}>{r.grade ?? '—'}</td>
                  <td style={td}>{fmt(kgOf(r), 1)}</td>
                  <td style={td}>{valueOf(r) == null ? <span style={{ color: '#C2C2C2' }}>– no price</span> : thb(valueOf(r)!)}</td>
                  <td style={td}>{r.qty}</td><td style={td}>{r.used}</td><td style={{ ...td, fontWeight: 600 }}>{r.available}</td>
                  <td style={td}>{r.certificate ?? '—'}</td>
                  <td style={td}>
                    <button onClick={() => navigate(`/cutting-plan/${r.upload_id}`)} style={{ fontSize: 12, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {[r.project_code, r.zone].filter(Boolean).join(' · ') || `Upload ${r.upload_id}`}
                    </button>
                    <span style={{ color: '#9CA3AF' }}>{` · ${new Date(r.uploaded).toLocaleDateString('en-GB')}`}</span>
                  </td>
                  <td style={td}>
                    {canWrite && r.available > 0 && <button onClick={() => { setUsing(r); setQty('1'); setNote('') }} style={{ height: 26, padding: '0 10px', fontSize: 12, fontWeight: 600, border: '1px solid #C2C2C2', borderRadius: 6, background: 'white', cursor: 'pointer' }}>Use</button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={12} style={{ padding: 20, color: '#8E8E8E' }}>No remnants match</td></tr>}
            </tbody>
          </table>
        )}
        {rows.length > 500 && <div style={{ padding: '8px 12px', fontSize: 11, color: '#6B7280' }}>{`First 500 of ${rows.length}: search to narrow down`}</div>}
      </div>

      {using && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setUsing(null)}>
          <div role="dialog" aria-label="Use remnant" onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 10, width: 'min(420px, 94vw)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{`Use ${using.offcut_no}`}</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{`${using.available} of ${using.qty} left. The pieces taken out are kept with who and when.`}</div>
            <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>Pieces
              <input type="number" aria-label="Pieces to use" min={1} max={using.available} value={qty} onChange={e => setQty(e.target.value)} style={{ height: 30, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 8px' }} />
            </label>
            <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>Used for (optional)
              <input aria-label="Used for" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="e.g. project / job" style={{ height: 30, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 8px' }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setUsing(null)} style={{ height: 32, padding: '0 14px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 6, background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitUse} disabled={use.isPending} className="disabled:opacity-40" style={{ height: 32, padding: '0 14px', fontSize: 13, fontWeight: 600, color: 'white', background: '#C8202A', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Take out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
