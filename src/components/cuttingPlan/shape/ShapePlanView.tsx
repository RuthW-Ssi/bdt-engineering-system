import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { downloadCuttingPlanFile } from '../../../api/cutting-plan'
import type { CuttingPlanDetail, CuttingPlanShapeLayout, CuttingPlanShapeSize } from '../../../api/cutting-plan'
import { barSegments, shapeSummary, stockMix } from '../../../lib/cuttingPlan/shapeSummary'
import { getErrorMessage } from '../../../lib/getErrorMessage'

// Cutting Plan Shape detail (2026-11-10): the "cutting layouts" view only — summary cards, one row per size,
// and each size's layouts drawn to scale. Figures come from the CutLogic report as saved.
const PALETTE = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#65A30D', '#DB2777', '#4F46E5', '#CA8A04']
const n = (v: string | number | null | undefined) => Number(v ?? 0)
const mm = (v: string | number) => n(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const card = { background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 16px' } as const

function LayoutBar({ layout, kerfMm, colorOf }: { layout: CuttingPlanShapeLayout; kerfMm: number; colorOf: (mark: string) => string }) {
  const stock = n(layout.stock_length_mm)
  return (
    <div role="img" aria-label={`Stock ${mm(stock)} mm`} style={{ position: 'relative', height: 28, background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 4, overflow: 'hidden' }}>
      {barSegments(layout, kerfMm).map((s, i) => (
        <div key={i} title={s.kind === 'part' ? `${s.mark} · ${mm(s.toMm - s.fromMm)} mm` : s.kind === 'rest' ? `Rest ${mm(s.toMm - s.fromMm)} mm` : `Kerf ${mm(s.toMm - s.fromMm)} mm`}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: `${(s.fromMm / stock) * 100}%`, width: `${((s.toMm - s.fromMm) / stock) * 100}%`,
            background: s.kind === 'part' ? colorOf(s.mark!) : s.kind === 'kerf' ? '#111827' : 'transparent',
            color: 'white', fontSize: 11, lineHeight: '28px', paddingLeft: s.kind === 'part' ? 6 : 0, overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
          {s.kind === 'part' ? s.mark : ''}
        </div>
      ))}
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
            <span style={{ color: '#6B7280' }}>Rest {mm(l.rest_mm)} mm</span>
          </div>
          <LayoutBar layout={l} kerfMm={n(size.kerf_mm)} colorOf={colorOf} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 6, fontSize: 12, color: '#374151' }}>
            {l.parts.map(p => (
              <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(p.mark) }} />
                {p.mark} <span style={{ color: '#6B7280' }}>{mm(p.length_mm)} × {p.count}</span>
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
  const pdfOf = (profile: string) => detail.files.find(f => f.kind === 'PDF' && f.plate_name === profile)
  const download = async (profile: string) => {
    const f = pdfOf(profile)
    if (!f) return
    try { await downloadCuttingPlanFile(f) } catch (e) { toast.error(getErrorMessage(e, 'Download failed. Please try again.')) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { v: sum.stocks.toLocaleString('en-US'), l: 'Stock pieces' },
          { v: `${sum.stockLengthM.toLocaleString('en-US', { maximumFractionDigits: 1 })} m`, l: 'Stock length used' },
          { v: sum.parts.toLocaleString('en-US'), l: 'Parts' },
          { v: `${sum.yieldPct.toFixed(2)}%`, l: 'Yield' },
        ].map(c => (
          <div key={c.l} style={card}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1F1F1F' }}>{c.v}</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{c.l}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}>
              {['Size', 'Grade', 'Parts', 'Stock pieces', 'Stock mix', 'Yield (CutLogic)', 'PDF'].map(h => (
                <th key={h} style={{ padding: '10px 12px', fontWeight: 500, textAlign: ['Parts', 'Stock pieces', 'Yield (CutLogic)'].includes(h) ? 'right' : 'left' }}>{h}</th>
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

      {sizes.filter(s => s.id === open).map(s => (
        <div key={s.id} style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.profile} · {s.layouts.length} layouts · kerf {mm(s.kerf_mm ?? 0)} mm</div>
          <SizeLayouts size={s} />
        </div>
      ))}
    </div>
  )
}
