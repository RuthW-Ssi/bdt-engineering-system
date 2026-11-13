import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getShapeEndCuts } from '../../api/cutting-plan-test'
import type { ShapeEndCut, ShapeTestLayout } from '../../api/cutting-plan-test'
import { barPieces, nestTurn, pieceColors, pipeSection } from '../../lib/cuttingPlanTest/shapeTest'
import type { PipeBarScene } from './pipeBarScene'

// CP-Shape-Test (Tao 2026-11-12, step 1 of 3D, after BdtPipeCut's "ดู 3D"): one stock bar of a layout: the marks it
// is cut into, where each sits on the bar, and the bar in 3D. Step 2: the real end cuts of each mark from the project's
// IFC model (BOM source only — a part list file has no project); a mark not found in the model is drawn square.
const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const KIND: Record<string, string> = { saddle: 'Saddle', slot: 'Slot', straight: 'Straight' }
const hasWebgl = () => { try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false } }

export function PipeBar3dDialog({ title, profile, layout, marks, kerfMm, projectId, onClose }: {
  title: string; profile: string; layout: ShapeTestLayout; marks: string[]; kerfMm: number; projectId: number | null; onClose: () => void
}) {
  const pieces = barPieces(layout, marks, kerfMm)
  const L = layout.stockLengthMm
  // what is left starts after the last cut: the layout's scrap (audit 2026-11-13: it started at the last piece, a kerf too long)
  const leftFrom = L - layout.restMm
  const distinct = [...new Set(pieces.map(p => p.mark))]
  const colorOf = pieceColors(layout) // as the bar: by length, so a piece wears one colour in both
  const [selected, setSelected] = useState<number | null>(null)
  const selectedRef = useRef<number | null>(null) // a piece picked before the 3D finished loading is zoomed to once it is up
  const [webgl] = useState(hasWebgl)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<PipeBarScene | null>(null)
  // end cuts: undefined while loading, then per mark (null = not in the model)
  const [ends, setEnds] = useState<{ source: string | null; marks: Record<string, ShapeEndCut | null> } | undefined>(projectId ? undefined : { source: null, marks: {} })

  useEffect(() => {
    if (!projectId) return
    let gone = false
    getShapeEndCuts({ project_id: projectId, marks: distinct })
      .then(r => { if (!gone) setEnds(r) })
      .catch(() => { if (!gone) setEnds({ source: null, marks: {} }) })
    return () => { gone = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!webgl || !canvas.current || !ends) return
    let gone = false
    const c = canvas.current
    const ro = new ResizeObserver(() => scene.current?.resize(c.clientWidth, c.clientHeight))
    import('./pipeBarScene').then(({ PipeBarScene }) => { // three.js only loads when a bar is opened
      if (gone) return
      const { outerMm, wallMm } = pipeSection(profile)
      // nested joints: each next piece turned round the axis so its saddle tucks into the previous one (cumulative)
      const turns: number[] = []
      pieces.forEach((p, k) => {
        const prev = pieces[k - 1], g = ends.marks[p.mark]?.grids, gp = prev && ends.marks[prev.mark]?.grids
        turns.push(k && (layout.nestMm?.[k - 1] ?? 0) > 0 && g && gp ? turns[k - 1] + nestTurn(gp, g, kerfMm) : (turns[k - 1] ?? 0))
      })
      scene.current = new PipeBarScene(c, { stockMm: L, outerMm, wallMm, leftFromMm: leftFrom, pieces: pieces.map((p, k) => ({ fromMm: p.fromMm, toMm: p.toMm, color: colorOf(p.lengthMm), grids: ends.marks[p.mark]?.grids, turnDeg: turns[k] })) })
      scene.current.resize(c.clientWidth, c.clientHeight)
      const picked = pieces.find(x => x.n === selectedRef.current)
      if (picked) scene.current.focus({ fromMm: picked.fromMm, toMm: picked.toMm })
      ro.observe(c)
    })
    return () => { gone = true; ro.disconnect(); scene.current?.dispose(); scene.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl, ends])

  const pick = (n: number | null) => {
    setSelected(n)
    selectedRef.current = n
    const p = pieces.find(x => x.n === n)
    scene.current?.focus(p ? { fromMm: p.fromMm, toMm: p.toMm } : null)
  }
  const btn = (on: boolean) => ({ fontSize: 12, height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: on ? '#E5E7EB' : 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }) as const
  const td = { padding: '6px 10px', borderTop: '1px solid #F3F4F6' } as const
  const endsOf = (mark: string) => {
    if (!projectId) return { kinds: 'Square', from: 'No model (part list file)' }
    if (!ends) return { kinds: '…', from: 'Loading end cuts…' }
    const c = ends.marks[mark]
    if (!c) return { kinds: 'Square', from: ends.source ? 'Not found in model, drawn square' : 'No end-cut data for this project, drawn square' }
    return { kinds: `${KIND[c.L] ?? c.L} · ${KIND[c.R] ?? c.R}`, from: `Model · ${c.instances} pcs${c.spreadMm > 1 ? `, variants differ up to ${mm(c.spreadMm)} mm` : ''}` }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 10, width: 'min(1100px, 94vw)', maxHeight: '92vh', overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{title}</div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'inline-flex' }}><X size={18} /></button>
        </div>
        {webgl
          ? <canvas ref={canvas} style={{ width: '100%', height: 420, borderRadius: 6, display: 'block' }} />
          : <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', borderRadius: 6, fontSize: 12, color: '#6B7280' }}>3D needs WebGL in this browser</div>}
        <div style={{ fontSize: 12, color: '#6B7280' }}>Drag to rotate · scroll to zoom · orange = cut · grey = left at end · gap between pieces = kerf {mm(kerfMm)} mm{ends?.source ? ` · end cuts from ${ends.source}` : ''}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={btn(selected == null)} onClick={() => pick(null)}>Whole bar</button>
          {pieces.map(p => (
            <button key={p.n} style={btn(selected === p.n)} onClick={() => pick(p.n)}>
              <i style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(p.lengthMm) }} />{`${p.n} · ${p.mark}`}
            </button>
          ))}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}>
            {['#', 'Mark', 'Length (mm)', 'On the bar (mm)', 'Ends (left · right)', 'End cuts from'].map(h => <th key={h} style={{ padding: '6px 10px', fontWeight: 500 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pieces.map(p => (
              <tr key={p.n} onClick={() => pick(p.n)} style={{ cursor: 'pointer', background: selected === p.n ? '#F9FAFB' : 'white' }}>
                <td style={td}>{p.n}</td>
                <td style={{ ...td, fontWeight: 600 }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: colorOf(p.lengthMm), marginRight: 6 }} />{p.mark}</td>
                <td style={td}>{mm(p.lengthMm)}</td>
                <td style={td}>{`${mm(p.fromMm)} – ${mm(p.toMm)}`}</td>
                <td style={td}>{endsOf(p.mark).kinds}</td>
                <td style={{ ...td, color: '#6B7280', fontSize: 12 }}>{endsOf(p.mark).from}</td>
              </tr>
            ))}
            <tr style={{ color: '#6B7280' }}>
              <td style={td}>Left at end</td>
              <td style={td}>{`${mm(Math.max(0, L - leftFrom))} mm`}</td>
              <td style={td} />
              <td style={td}>{`${mm(leftFrom)} – ${mm(L)}`}</td>
              <td style={td} /><td style={td} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
