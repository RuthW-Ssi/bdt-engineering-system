import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { downloadCuttingPlanFile } from '../../../api/cutting-plan'
import type { CuttingPlanDetail, CuttingPlanShapeLayout, CuttingPlanShapeSize } from '../../../api/cutting-plan'
import { barSegments, labelFits, scrapMm, shapeCharts, shapeSummary, stockMix } from '../../../lib/cuttingPlan/shapeSummary'
import { ShapeCharts } from './ShapeCharts'
import { Printer } from 'lucide-react'
import { shapeSizeBalance } from '../../../lib/cuttingPlan/shapeMaterial'
import { MaterialBalanceSheet } from '../MaterialBalanceSheet'
import { planLabel } from '../../../lib/cuttingPlan/planLabel'
import { getErrorMessage } from '../../../lib/getErrorMessage'

// Cutting Plan Shape detail (2026-11-10): the "cutting layouts" view only — summary cards, one row per size,
// and each size's layouts drawn to scale. Figures come from the CutLogic report as saved.
const PALETTE = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#65A30D', '#DB2777', '#4F46E5', '#CA8A04']
const n = (v: string | number | null | undefined) => Number(v ?? 0)
const mm = (v: string | number) => n(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const metres = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} m`
const HATCH = 'repeating-linear-gradient(45deg, #E5E7EB 0 4px, #F9FAFB 4px 8px)'
const card = { background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 16px' } as const

function LayoutBar({ layout, kerfMm, colorOf }: { layout: CuttingPlanShapeLayout; kerfMm: number; colorOf: (mark: string) => string }) {
  const stock = n(layout.stock_length_mm)
  return (
    <div role="img" aria-label={`Stock ${mm(stock)} mm`} style={{ position: 'relative', height: 28, background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 4, overflow: 'hidden' }}>
      {barSegments(layout, kerfMm).map((s, i) => (
        <div key={i} title={s.kind === 'part' ? `${s.mark} · ${mm(s.toMm - s.fromMm)} mm` : s.kind === 'rest' ? `Scrap ${mm(s.toMm - s.fromMm)} mm` : `Kerf ${mm(s.toMm - s.fromMm)} mm`}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: `${(s.fromMm / stock) * 100}%`, width: `${((s.toMm - s.fromMm) / stock) * 100}%`,
            background: s.kind === 'part' ? colorOf(s.mark!) : s.kind === 'kerf' ? '#111827' : HATCH,
            color: 'white', fontSize: 11, lineHeight: '28px', paddingLeft: s.kind === 'part' ? 6 : 0, overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
          {s.kind === 'part' ? s.mark : ''}
        </div>
      ))}
    </div>
  )
}

// Dimension lines under the bar (2026-11-11): each part's length, the kerf at each cut and the scrap (CutLogic Rest)
// at the end. Numbers too wide for their span stay in the tooltip.
export function LayoutDims({ layout, kerfMm }: { layout: CuttingPlanShapeLayout; kerfMm: number }) {
  const stock = n(layout.stock_length_mm)
  const segs = barSegments(layout, kerfMm)
  const pct = (v: number) => `${(v / stock) * 100}%`
  const rest = segs.find(s => s.kind === 'rest')
  const text = { fontSize: 11, color: '#374151', whiteSpace: 'nowrap', lineHeight: '14px' } as const
  return (
    <div data-testid={`dims-${layout.seq}`} style={{ marginTop: 4 }}>
      <div style={{ position: 'relative', height: 16 }}>
        {segs.filter(s => s.kind === 'part').map((s, i) => (
          <div key={i} title={`${s.mark} · ${mm(s.toMm - s.fromMm)} mm`}
            style={{ position: 'absolute', top: 0, height: 14, left: pct(s.fromMm), width: pct(s.toMm - s.fromMm), borderLeft: '1px solid #9CA3AF', borderRight: '1px solid #9CA3AF', boxSizing: 'border-box' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 1, background: '#9CA3AF' }} />
            {labelFits(s.fromMm, s.toMm, stock) && (
              <span style={{ ...text, position: 'relative', display: 'block', width: 'fit-content', margin: '0 auto', background: 'white', padding: '0 4px' }}>{mm(s.toMm - s.fromMm)} mm</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', height: 14 }}>
        {segs.map((s, i) => {
          if (s.kind !== 'kerf') return null
          const prev = segs[i - 1]
          // the kerf beside the scrap would collide with the scrap number (the size header shows the kerf anyway)
          if (!prev || !labelFits(prev.fromMm, prev.toMm, stock) || segs[i + 1]?.kind === 'rest') return null
          return <span key={i} style={{ ...text, position: 'absolute', left: pct((s.fromMm + s.toMm) / 2), transform: 'translateX(-50%)', color: '#6B7280' }}>{mm(s.toMm - s.fromMm)} mm</span>
        })}
        {rest && (
          <span title={`Scrap ${mm(layout.rest_mm)} mm`}
            style={{ ...text, position: 'absolute', color: '#B45309', fontWeight: 600, right: 0 }}>
            Scrap {mm(layout.rest_mm)} mm
          </span>
        )}
      </div>
    </div>
  )
}

function SizeLayouts({ size }: { size: CuttingPlanShapeSize }) {
  const marks = [...new Set(size.layouts.flatMap(l => l.parts.map(p => p.mark)))]
  const colorOf = (m: string) => PALETTE[marks.indexOf(m) % PALETTE.length]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {size.layouts.map(l => (
        <div key={l.id} style={{ borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', fontSize: 13, marginBottom: 6 }}>
            <strong>{l.seq}</strong>
            <span>{mm(l.stock_length_mm)} mm</span>
            <span style={{ background: '#F3F4F6', borderRadius: 4, padding: '1px 6px' }}>×{l.repeat}</span>
            <span style={{ color: '#B45309' }}>Scrap {mm(l.rest_mm)} mm/pc · total {mm(n(l.rest_mm) * l.repeat)} mm (×{l.repeat})</span>
          </div>
          <LayoutBar layout={l} kerfMm={n(size.kerf_mm)} colorOf={colorOf} />
          <LayoutDims layout={l} kerfMm={n(size.kerf_mm)} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 6, fontSize: 12, color: '#374151' }}>
            {l.parts.map(p => (
              <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(p.mark) }} />
                {p.mark} <span style={{ color: '#6B7280' }}>{mm(p.length_mm)} mm × {p.count}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ShapePlanView({ detail }: { detail: CuttingPlanDetail }) {
  const sizes = detail.shape_sizes ?? []
  const [open, setOpen] = useState<number | null>(sizes[0]?.id ?? null)
  const sum = shapeSummary(sizes)
  // user report 2026-11-26: weight per profile, loss (kerf) apart from scrap (Rest), material balance
  const bal = sizes.map(sz => ({ sz, b: shapeSizeBalance(sz) }))
  const tot = (f: (x: (typeof bal)[number]['b']) => number | null) => bal.reduce((a, x) => a + (f(x.b) ?? 0), 0)
  const noWeight = bal.filter(x => x.b.kgPerM == null).map(x => x.sz.profile)
  const kgs = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`)
  const [print, setPrint] = useState(false)
  const layoutsRef = useRef<HTMLDivElement>(null)
  const showSize = (id: number) => { setOpen(id); requestAnimationFrame(() => layoutsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })) }
  const pdfOf = (profile: string) => detail.files.find(f => f.kind === 'PDF' && f.plate_name === profile)
  const download = async (profile: string) => {
    const f = pdfOf(profile)
    if (!f) return
    try { await downloadCuttingPlanFile(f) } catch (e) { toast.error(getErrorMessage(e, 'Download failed. Please try again.')) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div data-testid="shape-totals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { v: sum.stocks.toLocaleString('en-US'), l: 'Stock pieces' },
          { v: `${sum.stockLengthM.toLocaleString('en-US', { maximumFractionDigits: 1 })} m`, l: 'Stock length used' },
          { v: kgs(tot(b => b.stockKg)), l: 'Stock weight' },
          { v: sum.parts.toLocaleString('en-US'), l: 'Parts' },
          { v: `${sum.yieldPct.toFixed(2)}%`, l: 'Yield' },
          { v: metres(sum.scrapM), l: 'Scrap (Rest)', sub: `${kgs(tot(b => b.scrapKg))} · ${tot(b => b.remnantPcs)} pcs kept as remnants` },
          { v: metres(tot(b => b.lossMm) / 1000), l: 'Loss (kerf)', sub: kgs(tot(b => b.lossKg)) },
        ].map((c: { v: string; l: string; sub?: string }) => (
          <div key={c.l} style={card}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1F1F1F' }}>{c.v}</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{c.l}</div>
            {c.sub && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      <ShapeCharts charts={shapeCharts(sizes)} selected={open} onSelect={showSize} />

      <div style={{ ...card, padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}>
              {['Size', 'Grade', 'Parts', 'Stock pieces', 'Stock mix', 'kg/m', 'Weight', 'Scrap', 'Loss (kerf)', 'Yield (CutLogic)', 'PDF'].map(h => (
                <th key={h} style={{ padding: '10px 12px', fontWeight: 500, textAlign: ['Parts', 'Stock pieces', 'kg/m', 'Weight', 'Scrap', 'Loss (kerf)', 'Yield (CutLogic)'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizes.map(s => (
              <tr key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)}
                style={{ borderTop: '1px solid #F3F4F6', cursor: 'pointer', background: open === s.id ? '#F3F4F6' : 'white' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.profile}</td>
                <td style={{ padding: '10px 12px' }}>{s.grade ?? '—'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{s.parts}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{s.stocks}</td>
                <td style={{ padding: '10px 12px' }}>{stockMix(s.layouts)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{shapeSizeBalance(s).kgPerM?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{kgs(shapeSizeBalance(s).stockKg)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{metres(scrapMm(s.layouts) / 1000)}<div style={{ fontSize: 11, color: '#6B7280' }}>{kgs(shapeSizeBalance(s).scrapKg)}</div></td>
                <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{metres(shapeSizeBalance(s).lossMm / 1000)}<div style={{ fontSize: 11, color: '#6B7280' }}>{kgs(shapeSizeBalance(s).lossKg)}</div></td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{n(s.yield_pct).toFixed(2)}%</td>
                <td style={{ padding: '10px 12px' }}>
                  {pdfOf(s.profile) && (
                    <button onClick={e => { e.stopPropagation(); download(s.profile) }} aria-label={`Download the ${s.profile} PDF`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0C447C', display: 'inline-flex' }}>
                      <Download size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div data-testid="shape-balance" style={{ ...card, padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Material balance <span style={{ fontSize: 12, fontWeight: 400, color: '#6B7280' }}>· stock issued = parts + scrap (Rest, kept as remnants) + loss (kerf)</span></div>
          <button onClick={() => setPrint(true)} style={{ height: 30, padding: '0 12px', fontSize: 12, fontWeight: 600, background: 'white', border: '1px solid #C2C2C2', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Printer size={13} />Print material balance
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 11 }}>
            {['Size', 'Grade', 'Issued', 'Parts', 'Scrap → remnants', 'Loss (kerf)'].map(h => <th key={h} style={{ padding: '6px 12px', fontWeight: 500, borderTop: '1px solid #F3F4F6' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {bal.map(({ sz, b }) => (
              <tr key={sz.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={{ padding: '6px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{sz.profile}</td><td style={{ padding: '6px 12px' }}>{sz.grade ?? '—'}</td>
                <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${sz.stocks} pcs · ${metres(b.stockMm / 1000)} · ${kgs(b.stockKg)}`}</td>
                <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${metres(b.partsMm / 1000)} · ${kgs(b.partsKg)}`}</td>
                <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${b.remnantPcs} pcs · ${metres(b.scrapMm / 1000)} · ${kgs(b.scrapKg)}`}</td>
                <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${metres(b.lossMm / 1000)} · ${kgs(b.lossKg)}`}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid #E5E7EB', fontWeight: 600 }}>
              <td style={{ padding: '6px 12px' }}>Total</td><td />
              <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${sum.stocks} pcs · ${metres(tot(b => b.stockMm) / 1000)} · ${kgs(tot(b => b.stockKg))}`}</td>
              <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${metres(tot(b => b.partsMm) / 1000)} · ${kgs(tot(b => b.partsKg))}`}</td>
              <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${tot(b => b.remnantPcs)} pcs · ${metres(tot(b => b.scrapMm) / 1000)} · ${kgs(tot(b => b.scrapKg))}`}</td>
              <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{`${metres(tot(b => b.lossMm) / 1000)} · ${kgs(tot(b => b.lossKg))}`}</td>
            </tr>
          </tbody>
        </table>
        {noWeight.length > 0 && <div style={{ padding: '8px 16px 12px', fontSize: 11, color: '#92400E' }}>{`No weight for ${noWeight.join(', ')} (section not recognised)`}</div>}
      </div>
      {print && (
        <MaterialBalanceSheet title="MATERIAL BALANCE · SHAPE" planLabel={planLabel(detail)} onClose={() => setPrint(false)}
          meta={[{ label: 'Stock issued', value: `${sum.stocks} pcs · ${kgs(tot(b => b.stockKg))}` }, { label: 'Remnants to return', value: `${tot(b => b.remnantPcs)} pcs · ${kgs(tot(b => b.scrapKg))}` }, { label: 'Loss (kerf)', value: kgs(tot(b => b.lossKg)) }]}
          columns={[{ key: 'p', label: 'Size' }, { key: 'g', label: 'Grade' }, { key: 'n', label: 'Stock pcs', align: 'right' }, { key: 'im', label: 'Issued m', align: 'right' }, { key: 'ik', label: 'Issued kg', align: 'right' },
            { key: 'pk', label: 'Parts kg', align: 'right' }, { key: 'rn', label: 'Remnant pcs', align: 'right' }, { key: 'rk', label: 'Remnant kg', align: 'right' }, { key: 'lk', label: 'Loss kg', align: 'right' }]}
          rows={bal.map(({ sz, b }) => ({ p: sz.profile, g: sz.grade ?? '—', n: String(sz.stocks), im: (b.stockMm / 1000).toFixed(2), ik: kgs(b.stockKg).replace(' kg', ''), pk: kgs(b.partsKg).replace(' kg', ''), rn: String(b.remnantPcs), rk: kgs(b.scrapKg).replace(' kg', ''), lk: kgs(b.lossKg).replace(' kg', '') }))}
          total={{ p: 'Total', n: String(sum.stocks), im: (tot(b => b.stockMm) / 1000).toFixed(2), ik: kgs(tot(b => b.stockKg)).replace(' kg', ''), pk: kgs(tot(b => b.partsKg)).replace(' kg', ''), rn: String(tot(b => b.remnantPcs)), rk: kgs(tot(b => b.scrapKg)).replace(' kg', ''), lk: kgs(tot(b => b.lossKg)).replace(' kg', '') }}
          notes={['Scrap = CutLogic Rest; every piece is kept in the remnant register (Cutting Plan › Remnants). Loss = the kerf of every cut. Weight = section area × 7.85 g/cm³.']} />
      )}

      {sizes.filter(s => s.id === open).map(s => (
        <div key={s.id} ref={layoutsRef} style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.profile} · {s.layouts.length} layouts · kerf {mm(s.kerf_mm ?? 0)} mm</div>
          <SizeLayouts size={s} />
        </div>
      ))}
    </div>
  )
}
