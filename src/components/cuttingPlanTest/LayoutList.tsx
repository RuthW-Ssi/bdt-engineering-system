import { useState } from 'react'
import { Search } from 'lucide-react'
import type { ShapeTestLayout } from '../../api/cutting-plan-test'
import { barPieces, pieceColors, splitByMarkSet } from '../../lib/cuttingPlanTest/shapeTest'
import { labelFits } from '../../lib/cuttingPlan/shapeSummary'
import { ShowAll } from '../cuttingPlan/PlanSummary'
import { PipeBar3dDialog } from './PipeBar3dDialog'

// CP-Shape-Test: the layouts of one size, as bars drawn to scale (moved out of ShapeTestPanel 2026-11-13).
const HATCH = 'repeating-linear-gradient(45deg, #E5E7EB 0 4px, #F9FAFB 4px 8px)'
const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const CAP = 10 // a size can have 50+ layouts: the first ones, then "Show all" (as the summary charts do)

// Each piece shows its mark(s) only (Tao 2026-11-11: marks rather than sizes; 2026-11-12: lengths go on the dimension
// lines under the bar, not beside the mark). Colours follow the piece length (pieceColors, as the 3D).
function LayoutBar({ layout, marks, kerfMm, colorOf }: { layout: ShapeTestLayout; marks: string[]; kerfMm: number; colorOf: (lengthMm: number) => string }) {
  const L = layout.stockLengthMm
  const segs: { from: number; to: number; kind: 'part' | 'kerf' | 'rest'; length?: number; mark?: string; start?: boolean }[] = []
  // positions as on the bar (a nested saddle piece starts inside the previous one's span, drawn over it)
  const at = barPieces(layout, marks, kerfMm)
  at.forEach((p, k) => {
    segs.push({ from: p.fromMm, to: Math.min(L, p.toMm), kind: 'part', length: p.lengthMm, mark: p.mark, start: k > 0 })
    const kerfEnd = Math.min(L, p.toMm + kerfMm, at[k + 1]?.fromMm ?? Infinity)
    if (kerfEnd > p.toMm) segs.push({ from: p.toMm, to: kerfEnd, kind: 'kerf' })
  })
  if (layout.restMm > 0) segs.push({ from: L - layout.restMm, to: L, kind: 'rest' })
  return (
    <div role="img" aria-label={`Stock ${mm(L)} mm`} style={{ position: 'relative', height: 26, background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 4, overflow: 'hidden' }}>
      {segs.map((s, i) => (
        <div key={i} title={s.kind === 'part' ? `${mm(s.length!)} mm · ${s.mark}` : s.kind === 'rest' ? `Scrap ${mm(s.to - s.from)} mm` : `Kerf ${mm(s.to - s.from)} mm`}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: `${(s.from / L) * 100}%`, width: `${((s.to - s.from) / L) * 100}%`,
            background: s.kind === 'part' ? colorOf(s.length!) : s.kind === 'kerf' ? '#111827' : HATCH,
            color: 'white', fontSize: 11, lineHeight: '26px', paddingLeft: s.kind === 'part' ? 6 : 0, overflow: 'hidden', whiteSpace: 'nowrap',
            // a white line where a piece starts: a nested joint has no kerf strip, and two pieces of one length share a colour
            boxShadow: s.start ? 'inset 2px 0 0 white' : undefined,
          }}>
          {s.kind === 'part' ? s.mark : ''}
        </div>
      ))}
    </div>
  )
}

// Dimension lines under the bar, from the pieces as placed (barPieces), so a nested layout gets them too (Tao
// 2026-11-13): each piece's length, then at each joint the kerf, or "Nest x mm" where the next piece tucks in.
function BarDims({ n, layout, pieces, kerfMm, bg }: { n: number; layout: ShapeTestLayout; pieces: { fromMm: number; toMm: number; lengthMm: number; mark: string }[]; kerfMm: number; bg: string }) {
  const L = layout.stockLengthMm
  const pct = (v: number) => `${(v / L) * 100}%`
  const text = { fontSize: 11, color: '#374151', whiteSpace: 'nowrap', lineHeight: '14px' } as const
  return (
    <div data-testid={`dims-${n}`} style={{ marginTop: 4 }}>
      <div style={{ position: 'relative', height: 16 }}>
        {pieces.map((p, k) => (
          <div key={k} title={`${p.mark} · ${mm(p.lengthMm)} mm`}
            style={{ position: 'absolute', top: 0, height: 14, left: pct(p.fromMm), width: pct(Math.min(L, p.toMm) - p.fromMm), borderLeft: '1px solid #9CA3AF', borderRight: '1px solid #9CA3AF', boxSizing: 'border-box' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 1, background: '#9CA3AF' }} />
            {labelFits(p.fromMm, p.toMm, L) && (
              <span style={{ ...text, position: 'relative', display: 'block', width: 'fit-content', margin: '0 auto', background: bg, padding: '0 4px' }}>{mm(p.lengthMm)} mm</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', height: 14 }}>
        {pieces.slice(1).map((p, k) => {
          const prev = pieces[k], nested = layout.nestMm?.[k] ?? 0
          if (!labelFits(prev.fromMm, prev.toMm, L)) return null
          return <span key={k} style={{ ...text, position: 'absolute', left: pct((prev.toMm + p.fromMm) / 2), transform: 'translateX(-50%)', color: nested > 0 ? '#0F766E' : '#6B7280' }}>
            {nested > 0 ? `Nest ${mm(nested)} mm` : `${mm(kerfMm)} mm`}
          </span>
        })}
        {layout.restMm > 0 && <span style={{ ...text, position: 'absolute', color: '#B45309', fontWeight: 600, right: 0 }}>{`Scrap ${mm(layout.restMm)} mm`}</span>}
      </div>
    </div>
  )
}

// The prefix every mark of a layout shares (up to its last "-", e.g. DBN-B2-), said once above the layout
function sharedPrefix(marks: string[]) {
  if (!marks.length) return ''
  let p = marks[0]
  for (const m of marks) while (!m.startsWith(p)) p = p.slice(0, -1)
  return p.slice(0, p.lastIndexOf('-') + 1)
}

// One layout per set of marks (Tao 2026-11-12, splitByMarkSet): every bar of a layout is the same pieces. One line
// of totals with the 3D button, then the bar drawn to scale with its marks and dimension lines. Tao 2026-11-13 ("hard
// to use"): lengths and marks are no longer repeated in a table under every bar — only a layout with pieces too short
// for a dimension label lists them (mark, length, × how many in a row). Past a handful of layouts: find a mark, pick a
// stock length, and the first CAP shown. A layout keeps its number whatever the filter.
export function LayoutList({ profile, layouts, kerfMm, projectId, bg = 'white' }: { profile: string; layouts: ShapeTestLayout[]; kerfMm: number; projectId: number | null; bg?: string }) {
  const [bar3d, setBar3d] = useState<{ title: string; layout: ShapeTestLayout; marks: string[] } | null>(null)
  const [find, setFind] = useState('')
  const [length, setLength] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const sets = splitByMarkSet(layouts).map((s, i) => ({ ...s, n: i + 1 }))
  const lengths = [...new Set(sets.map(s => s.layout.stockLengthMm))]
  const q = find.trim().toLowerCase()
  const match = sets.filter(s => (length == null || s.layout.stockLengthMm === length) && (!q || s.marks.some(mark => mark.toLowerCase().includes(q))))
  const shown = all || q ? match : match.slice(0, CAP)
  const seg = (on: boolean) => ({ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: on ? '#1F2937' : 'white', color: on ? 'white' : '#555' }) as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bar3d && <PipeBar3dDialog title={bar3d.title} profile={profile} layout={bar3d.layout} marks={bar3d.marks} kerfMm={kerfMm} projectId={projectId} onClose={() => setBar3d(null)} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {sets.length > 5 && <>
          <div className="relative">
            <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={find} onChange={e => setFind(e.target.value)} aria-label="Find a mark" placeholder="Find a mark, e.g. m52"
              style={{ paddingLeft: 32, paddingRight: 12, height: 28, fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 200 }} />
          </div>
          {lengths.length > 1 && (
            <div style={{ display: 'inline-flex', border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden' }}>
              <button aria-pressed={length == null} onClick={() => setLength(null)} style={seg(length == null)}>All lengths</button>
              {lengths.map(l => <button key={l} aria-pressed={length === l} onClick={() => setLength(l)} style={seg(length === l)}>{`${mm(l)} mm`}</button>)}
            </div>
          )}
        </>}
        <span style={{ fontSize: 12, color: '#6B7280' }}>{match.length === sets.length ? `${sets.length} ${sets.length === 1 ? 'layout' : 'layouts'}` : `${match.length} of ${sets.length} layouts`}{` · kerf ${mm(kerfMm)} mm`}</span>
      </div>
      {!match.length && <div style={{ fontSize: 12, color: '#8E8E8E' }}>No layout with that mark</div>}
      {shown.map(({ layout: l, marks, pattern, n }, i) => {
        const colorOf = pieceColors(l)
        const prefix = sharedPrefix(marks)
        const short = (mark: string) => mark.slice(prefix.length)
        const nest = (l.nestMm ?? []).filter(v => v > 0)
        const order = barPieces(l, marks, kerfMm)
        const first = sets.find(x => x.pattern === pattern)!.n
        // pieces in a row that are the same mark and length, said once
        const runs: { mark: string; lengthMm: number; count: number }[] = []
        for (const p of order) { const last = runs[runs.length - 1]; if (last && last.mark === p.mark && last.lengthMm === p.lengthMm) last.count++; else runs.push({ mark: p.mark, lengthMm: p.lengthMm, count: 1 }) }
        const cramped = order.some(p => !labelFits(p.fromMm, p.toMm, l.stockLengthMm))
        return (
          <div key={n} style={{ borderTop: i ? '1px solid #F3F4F6' : 'none', paddingTop: i ? 12 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 6, flexWrap: 'wrap' }}>
              <strong>{n}</strong>
              <strong>{`${mm(l.stockLengthMm)} mm × ${l.repeat} ${l.repeat === 1 ? 'bar' : 'bars'}`}</strong>
              <span style={{ color: '#6B7280', fontSize: 12 }}>{`Scrap ${mm(l.restMm)} mm · ${l.cuts} ${l.cuts === 1 ? 'cut' : 'cuts'} per bar`}</span>
              {nest.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#0F766E', background: '#CCFBF1', borderRadius: 999, padding: '1px 8px' }}>{`Nested · ${nest.length} ${nest.length === 1 ? 'joint' : 'joints'} · ${mm(nest.reduce((a, b) => a + b, 0))} mm saved`}</span>}
              {first < n && <span style={{ fontSize: 11, color: '#374151', background: '#F3F4F6', borderRadius: 999, padding: '1px 8px' }}>{`Same cuts as layout ${first}`}</span>}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {prefix && <span style={{ color: '#6B7280', fontSize: 12 }}>{`Marks ${prefix}…`}</span>}
                <button aria-label={`3D of layout ${n}`}
                  onClick={() => setBar3d({ title: `${profile} · layout ${n} · ${mm(l.stockLengthMm)} mm`, layout: l, marks })}
                  style={{ fontSize: 11, fontWeight: 600, color: '#0C447C', background: 'white', border: '1px solid #C2C2C2', borderRadius: 4, padding: '1px 8px', cursor: 'pointer' }}>3D</button>
              </span>
            </div>
            <LayoutBar layout={l} marks={marks.map(short)} kerfMm={kerfMm} colorOf={colorOf} />
            <BarDims n={n} layout={l} pieces={order} kerfMm={kerfMm} bg={bg} />
            {cramped && (
              <div role="list" aria-label={`Pieces of layout ${n}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginTop: 6, fontSize: 12, color: '#374151' }}>
                {runs.map((r, k) => (
                  <span role="listitem" key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                    <i style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(r.lengthMm) }} />
                    <b style={{ fontWeight: 600, color: '#111827' }}>{short(r.mark)}</b>
                    <span style={{ color: '#6B7280' }}>{`${mm(r.lengthMm)} mm${r.count > 1 ? ` × ${r.count}` : ''}`}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {!q && match.length > CAP && <div><ShowAll total={match.length} noun="layouts" open={all} onToggle={() => setAll(v => !v)} /></div>}
    </div>
  )
}
