// Shape summary charts (2026-11-11), the same three ideas as plate's: where the pipe goes, pipes per size,
// and the stock to prepare. Metres and pieces only: CutLogic reports carry no weight.
import { useState } from 'react'
import { BAR_SPAN, BLUE, Card, GRAY, INK, MUTED, pct, pctText, ROW_CAP, ShowAll, SideColumn } from '../PlanSummary'
import type { shapeCharts } from '../../../lib/cuttingPlan/shapeSummary'

type Charts = ReturnType<typeof shapeCharts>
const KERF = '#4B5563'
const STOCK_SHADES = [BLUE, '#7FB0E8', '#BFD7F3', '#DCE8F8'] // longest stock darkest; a 5th length reuses the last
const m = (mm: number) => (mm / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })
const pcs = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'piece' : 'pieces'}`

function PipeBar({ c }: { c: Charts }) {
  const segs = [
    { label: 'Parts', mm: c.partsMm, color: BLUE, note: 'part lengths from the report' },
    { label: 'Scrap (Rest)', mm: c.scrapMm, color: GRAY, note: 'Rest at the end of each pipe, as CutLogic reports it' },
    { label: 'Kerf', mm: c.kerfMm, color: KERF, note: 'lost to the saw at each cut' },
  ].filter(x => x.mm > 0)
  const pieces = c.bySize.reduce((t, s) => t + s.pieces, 0)
  return (
    <Card title={`Total pipe · ${m(c.stockMm)} m · ${pcs(pieces)}`}>
      <div role="img" aria-label="Pipe breakdown" style={{ display: 'flex', gap: 2, height: 14 }}>
        {segs.map((x, i) => (
          <div key={x.label} title={`${x.label}: ${m(x.mm)} m (${pctText(pct(x.mm, c.stockMm))}) · ${x.note}`}
            style={{
              width: `${pct(x.mm, c.stockMm)}%`, minWidth: 3, background: x.color,
              borderRadius: `${i === 0 ? 4 : 0}px ${i === segs.length - 1 ? 4 : 0}px ${i === segs.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
            }} />
        ))}
      </div>
      <div className="flex flex-wrap" style={{ gap: '6px 24px', marginTop: 10, fontSize: 12 }}>
        {segs.map(x => (
          <span key={x.label} className="inline-flex items-center" style={{ gap: 6, color: MUTED }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: x.color }} />
            {x.label}
            <b style={{ color: INK }}>{m(x.mm)} m</b>
            <span>({pctText(pct(x.mm, c.stockMm))})</span>
          </span>
        ))}
      </div>
    </Card>
  )
}

function SizeBars({ c, selected, onSelect }: { c: Charts; selected: number | null; onSelect: (id: number) => void }) {
  const lengths = [...new Set(c.bySize.flatMap(s => s.byStock.map(x => x.lengthMm)))].sort((a, b) => b - a)
  const shade = (len: number) => STOCK_SHADES[Math.min(lengths.indexOf(len), STOCK_SHADES.length - 1)]
  const max = Math.max(1, ...c.bySize.map(s => s.pieces))
  const [all, setAll] = useState(false)
  const rows = !all && c.bySize.length > ROW_CAP ? c.bySize.filter((s, i) => i < ROW_CAP || s.id === selected) : c.bySize
  return (
    <Card title="Pipes by size">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(s => {
          const on = selected === s.id
          return (
            <button key={s.id} type="button" onClick={() => onSelect(s.id)} aria-pressed={on}
              title={`${s.profile}: ${s.byStock.map(x => `${x.lengthMm.toLocaleString('en-US')} mm × ${x.pieces}`).join(' + ')} · ${m(s.stockMm)} m — click to see its layouts`}
              className="hover:bg-chrome-50"
              style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', alignItems: 'center', gap: 12, padding: '2px 6px', margin: '0 -6px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 12, fontWeight: on ? 700 : 600, color: INK, textAlign: 'right', padding: '3px 0', whiteSpace: 'nowrap' }}>{s.profile}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 2, height: 14, flexShrink: 0, width: `${pct(s.pieces, max) * BAR_SPAN}%`, minWidth: 3 }}>
                  {s.byStock.map((x, i) => (
                    <span key={x.lengthMm} style={{ flex: x.pieces, background: shade(x.lengthMm), borderRadius: i === s.byStock.length - 1 ? '0 4px 4px 0' : 0 }} />
                  ))}
                </span>
                <span style={{ fontSize: 12, color: INK, whiteSpace: 'nowrap' }}>
                  <b>{s.pieces}</b> pcs <span style={{ color: MUTED }}>· {m(s.stockMm)} m</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {c.bySize.length > ROW_CAP && <ShowAll total={c.bySize.length} noun="sizes" open={all} onToggle={() => setAll(v => !v)} />}
      <div className="flex flex-wrap" style={{ gap: '6px 16px', marginTop: 10, fontSize: 11, color: MUTED }}>
        {lengths.map(len => (
          <span key={len} className="inline-flex items-center" style={{ gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: shade(len) }} />{len.toLocaleString('en-US')} mm stock
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>Click a size to see its layouts</span>
      </div>
    </Card>
  )
}

// What to take from the store: one line per size + grade + stock length (people read exact sizes off it).
// The first 6 rows, then "Show all" lists every row, as plate's stock plates (no "Other" row).
const STOCK_ROWS = 6
function StockCard({ c }: { c: Charts }) {
  const [all, setAll] = useState(false)
  const rows = all ? c.stock : c.stock.slice(0, STOCK_ROWS)
  const total = c.stock.reduce((t, r) => t + r.pieces, 0)
  const line = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, fontSize: 12, padding: '2px 0' } as const
  return (
    <Card fill title="Stock to prepare">
      <div className="flex items-baseline" style={{ gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1 }}>{total.toLocaleString('en-US')}</span>
        <span style={{ fontSize: 12, color: MUTED }}>pcs · {c.stock.length} {c.stock.length === 1 ? 'row' : 'rows'}</span>
      </div>
      <div data-testid="stock-to-prepare" style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map(r => (
          <div key={`${r.profile}|${r.grade}|${r.lengthMm}`} style={{ ...line, color: INK }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.profile}{r.grade ? ` · ${r.grade}` : ''} · {r.lengthMm.toLocaleString('en-US')} mm
            </span>
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 56 }}><b>{r.pieces}</b> pcs</span>
          </div>
        ))}
      </div>
      {c.stock.length > STOCK_ROWS && <ShowAll total={c.stock.length} noun="rows" open={all} onToggle={() => setAll(v => !v)} />}
    </Card>
  )
}

export function ShapeCharts({ charts, selected, onSelect }: { charts: Charts; selected: number | null; onSelect: (id: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PipeBar c={charts} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 12 }}>
        <SizeBars c={charts} selected={selected} onSelect={onSelect} />
        <SideColumn testId="shape-side">
          <StockCard c={charts} />
        </SideColumn>
      </div>
    </div>
  )
}
