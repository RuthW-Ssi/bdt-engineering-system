import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Printer, Settings2, X } from 'lucide-react'
import type { CuttingPlanKerf, CuttingPlanNestingRow, CuttingPlanPrice, CuttingPlanRemnantRow } from '../../api/cutting-plan'
import { useSaveKerfs, useSetCertificate } from '../../hooks/useCuttingPlan'
import { summarizePlan } from '../../lib/cuttingPlan/planSummary'
import { kerfFor, priceFor, thb } from '../../lib/cuttingPlan/plateMaterial'
import { getErrorMessage } from '../../lib/getErrorMessage'
import { MaterialBalanceSheet } from './MaterialBalanceSheet'

// User test report 2026-11-26 (Plate tab): certificate per plate, kerf settings for the loss, material balance.
const kg = (v: number) => v.toLocaleString('en', { maximumFractionDigits: 1 })

// Free text (numbers and letters, Tao 2026-11-26); saved when the field is left, kept old → new on the server
export function CertificateCell({ nestingId, value, canWrite }: { nestingId: number; value: string | null | undefined; canWrite: boolean }) {
  const save = useSetCertificate()
  const [text, setText] = useState(value ?? '')
  if (!canWrite) return <span>{value || '—'}</span>
  const commit = async () => {
    if ((value ?? '') === text.trim()) return
    try { await save.mutateAsync({ id: nestingId, certificate: text.trim() || null }); toast.success('Certificate saved') } catch (e) { toast.error(getErrorMessage(e, 'Could not save the certificate')) }
  }
  return (
    <input aria-label="Material certificate" value={text} maxLength={100} placeholder="Add…"
      onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{ width: '100%', minWidth: 90, height: 26, fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 4, padding: '0 6px', background: save.isPending ? '#F9FAFB' : 'white' }} />
  )
}

// Kerf per cutting technology and thickness of this plan's plates (Tao: set once, applied when shown)
export function KerfDialog({ nestings, kerfs, onClose }: { nestings: CuttingPlanNestingRow[]; kerfs: CuttingPlanKerf[]; onClose: () => void }) {
  const keys = useMemo(() => {
    const m = new Map<string, { technology: string; thick_mm: number }>()
    for (const r of nestings) if (r.technology && r.thick_mm != null) m.set(`${r.technology}|${Number(r.thick_mm)}`, { technology: r.technology, thick_mm: Number(r.thick_mm) })
    for (const k of kerfs) m.set(`${k.technology}|${Number(k.thick_mm)}`, { technology: k.technology, thick_mm: Number(k.thick_mm) })
    return [...m.values()].sort((a, b) => a.technology.localeCompare(b.technology) || a.thick_mm - b.thick_mm)
  }, [nestings, kerfs])
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(kerfs.map(k => [`${k.technology}|${Number(k.thick_mm)}`, String(Number(k.kerf_mm))])))
  const save = useSaveKerfs()
  const apply = async () => {
    const rows = keys.map(k => { const v = vals[`${k.technology}|${k.thick_mm}`]?.trim(); return { ...k, kerf_mm: v ? Number(v) : null } })
    if (rows.some(r => r.kerf_mm != null && !(r.kerf_mm >= 0 && r.kerf_mm <= 20))) { toast.error('Kerf is 0 to 20 mm'); return }
    try { await save.mutateAsync(rows); toast.success('Kerf saved'); onClose() } catch (e) { toast.error(getErrorMessage(e, 'Could not save the kerf')) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div role="dialog" aria-label="Kerf settings" onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 10, width: 'min(560px, 94vw)', maxHeight: '86vh', overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Kerf settings</div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'inline-flex' }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>Width of the cut, per cutting method and plate thickness. Loss = cut length × kerf × thickness. Applies to every plan; empty = not set (the loss stays in scrap).</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}><th style={{ padding: 6, fontWeight: 500 }}>Cutting method</th><th style={{ padding: 6, fontWeight: 500 }}>Thickness</th><th style={{ padding: 6, fontWeight: 500 }}>Kerf (mm)</th></tr></thead>
          <tbody>
            {keys.map(k => {
              const id = `${k.technology}|${k.thick_mm}`
              return (
                <tr key={id} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: 6 }}>{k.technology}</td>
                  <td style={{ padding: 6 }}>{`${k.thick_mm} mm`}</td>
                  <td style={{ padding: 6 }}>
                    <input type="number" aria-label={`Kerf ${k.technology} ${k.thick_mm} mm`} min={0} max={20} step={0.1} value={vals[id] ?? ''} placeholder="not set"
                      onChange={e => setVals(v => ({ ...v, [id]: e.target.value }))} style={{ width: 90, height: 28, fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 6px' }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ height: 32, padding: '0 14px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 6, background: 'white', cursor: 'pointer' }}>Cancel</button>
          <button onClick={apply} disabled={save.isPending} className="disabled:opacity-40" style={{ height: 32, padding: '0 14px', fontSize: 13, fontWeight: 600, color: 'white', background: '#C8202A', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Save kerf</button>
        </div>
      </div>
    </div>
  )
}

export function KerfButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <Settings2 size={12} />Kerf settings
    </button>
  )
}

// Issued sheets = parts + remnants + scrap + loss, per grade and thickness, in kg and baht
export function PlateBalanceCard({ planLabel, nestings, remnants, kerfs, prices }: {
  planLabel: string; nestings: CuttingPlanNestingRow[]; remnants: CuttingPlanRemnantRow[]; kerfs: CuttingPlanKerf[] | undefined; prices: CuttingPlanPrice[] | undefined
}) {
  const [print, setPrint] = useState(false)
  const rows = useMemo(() => {
    const groups = new Map<string, CuttingPlanNestingRow[]>()
    for (const r of nestings) { const k = `${r.quality ?? '—'}|${Number(r.thick_mm)}`; groups.set(k, [...(groups.get(k) ?? []), r]) }
    return [...groups].map(([k, ns]) => {
      const [grade, thick] = k.split('|')
      const names = new Set(ns.map(r => r.cuttingplan_number))
      const s = summarizePlan(ns, remnants.filter(r => names.has(r.cuttingplan_number)), r => kerfFor(kerfs, r))
      const price = priceFor(prices, grade, Number(thick))
      return { grade, thick: Number(thick), s, price }
    }).sort((a, b) => a.grade.localeCompare(b.grade) || a.thick - b.thick)
  }, [nestings, remnants, kerfs, prices])
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0)
  const value = (r: (typeof rows)[number], v: number) => (r.price == null ? null : v * r.price)
  const money = (v: number | null) => (v == null ? '– no price' : thb(v))
  const priced = rows.filter(r => r.price != null)
  const lossMissing = sum(r => r.s.lossMissing)
  const t = { plates: sum(r => r.s.plates), steel: sum(r => r.s.steelKg), parts: sum(r => r.s.partsKg), rem: sum(r => r.s.remnantKg), scrap: sum(r => r.s.scrapKg), loss: sum(r => r.s.lossKg ?? 0) }
  const tv = { steel: priced.reduce((n, r) => n + r.s.steelKg * r.price!, 0), rem: priced.reduce((n, r) => n + r.s.remnantKg * r.price!, 0) }
  const td = { padding: '6px 12px', whiteSpace: 'nowrap' } as const
  const notes = [
    ...(lossMissing ? [`Loss not worked out for ${lossMissing} plate(s) (no kerf set or no .dxf): their kerf is still in Scrap.`] : []),
    ...(priced.length < rows.length ? [`No price in Materials for ${rows.length - priced.length} grade / thickness group(s): their value is not counted.`] : []),
  ]
  return (
    <div data-testid="plate-balance" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Material balance <span style={{ fontSize: 12, fontWeight: 400, color: '#6B7280' }}>· sheets issued = parts + remnants + scrap + loss</span></div>
        <button onClick={() => setPrint(true)} style={{ height: 30, padding: '0 12px', fontSize: 12, fontWeight: 600, background: 'white', border: '1px solid #C2C2C2', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Printer size={13} />Print material balance
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 11 }}>
          {['Grade', 'Thickness', 'Sheets', 'Issued (kg)', 'Value', 'Parts (kg)', 'Remnants (kg)', 'Remnant value', 'Scrap (kg)', 'Loss (kg)'].map(h => <th key={h} style={{ ...td, fontWeight: 500, borderTop: '1px solid #F3F4F6' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.grade}|${r.thick}`} style={{ borderTop: '1px solid #F3F4F6' }}>
              <td style={{ ...td, fontWeight: 600 }}>{r.grade}</td><td style={td}>{`${r.thick} mm`}</td><td style={td}>{r.s.plates}</td>
              <td style={td}>{kg(r.s.steelKg)}</td><td style={td}>{money(value(r, r.s.steelKg))}</td>
              <td style={td}>{kg(r.s.partsKg)}</td><td style={td}>{kg(r.s.remnantKg)}</td><td style={td}>{money(value(r, r.s.remnantKg))}</td>
              <td style={td}>{kg(r.s.scrapKg)}</td><td style={td}>{r.s.lossKg == null || r.s.lossMissing === r.s.plates ? 'kerf not set' : kg(r.s.lossKg)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid #E5E7EB', fontWeight: 600 }}>
            <td style={td}>Total</td><td /><td style={td}>{t.plates}</td><td style={td}>{kg(t.steel)}</td><td style={td}>{thb(tv.steel)}</td>
            <td style={td}>{kg(t.parts)}</td><td style={td}>{kg(t.rem)}</td><td style={td}>{thb(tv.rem)}</td><td style={td}>{kg(t.scrap)}</td><td style={td}>{kg(t.loss)}</td>
          </tr>
        </tbody>
      </table>
      {notes.length > 0 && <div style={{ padding: '8px 16px 12px', fontSize: 11, color: '#92400E' }}>{notes.map(n => <div key={n}>{n}</div>)}</div>}
      {print && (
        <MaterialBalanceSheet title="MATERIAL BALANCE · PLATE" planLabel={planLabel} onClose={() => setPrint(false)}
          meta={[{ label: 'Sheets issued', value: `${t.plates} · ${kg(t.steel)} kg` }, { label: 'Value issued', value: thb(tv.steel) }, { label: 'Remnants to return', value: `${kg(t.rem)} kg · ${thb(tv.rem)}` }]}
          columns={[{ key: 'g', label: 'Grade' }, { key: 't', label: 'Thick' }, { key: 'n', label: 'Sheets', align: 'right' }, { key: 'i', label: 'Issued kg', align: 'right' }, { key: 'v', label: 'Value', align: 'right' },
            { key: 'p', label: 'Parts kg', align: 'right' }, { key: 'r', label: 'Remnant kg', align: 'right' }, { key: 'rv', label: 'Remnant value', align: 'right' }, { key: 's', label: 'Scrap kg', align: 'right' }, { key: 'l', label: 'Loss kg', align: 'right' }]}
          rows={rows.map(r => ({ g: r.grade, t: `${r.thick} mm`, n: String(r.s.plates), i: kg(r.s.steelKg), v: money(value(r, r.s.steelKg)), p: kg(r.s.partsKg), r: kg(r.s.remnantKg), rv: money(value(r, r.s.remnantKg)), s: kg(r.s.scrapKg), l: r.s.lossMissing === r.s.plates ? 'kerf not set' : kg(r.s.lossKg ?? 0) }))}
          total={{ g: 'Total', n: String(t.plates), i: kg(t.steel), v: thb(tv.steel), p: kg(t.parts), r: kg(t.rem), rv: thb(tv.rem), s: kg(t.scrap), l: kg(t.loss) }}
          notes={notes} />
      )}
    </div>
  )
}
