import { useEffect, useMemo, useRef, useState } from 'react'
import type { CuttingPlanOrderPartRow, PlateView } from '../../../api/cutting-plan'
import { buildMachinePath, DEFAULT_MACHINE, headAt, partFinishTimes, plateTimeLabel, stateAt } from '../../../lib/cuttingPlan/machinePath'
import { PlateScene3d, type SceneState } from './plateScene3d'
import { drawPlate2d, pick2d, type Fit } from './draw2d'
import { COLORS, markColor } from './colors'

// Plate viewer (2026-11-06, from the approved mockup): 3D / 2D layout, cut path overlays and a
// CNC cutting simulation on the machine clock, with the plate's parts list beside it.
// Loaded lazily (three.js is only fetched when a plate is opened).
const SPEEDS = [60, 300, 1200] as const
const STATE_LABEL = { pierce: 'Piercing', cut: 'Cutting', rapid: 'Rapid move', done: '' }

function hasWebgl() {
  try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false }
}

export default function PlateViewer({ view, orders }: { view: PlateView; orders: CuttingPlanOrderPartRow[] }) {
  const mp = useMemo(() => buildMachinePath(view.path, view.machine ?? DEFAULT_MACHINE), [view])
  const finish = useMemo(() => partFinishTimes(view.parts, mp), [view, mp])
  const marks = useMemo(() => [...new Set(view.parts.map(p => p.mark))], [view])
  const byMark = useMemo(() => new Map(orders.map(o => [(o.drawing_part_no_version_no ?? '').trim(), o])), [orders])

  const [webglOk] = useState(hasWebgl)
  const [mode, setMode] = useState<'3d' | '2d'>(() => (hasWebgl() ? '3d' : '2d'))
  const [selected, setSelected] = useState<string | null>(null)
  const [explode, setExplode] = useState(true)
  const [showRapid, setShowRapid] = useState(false)
  const [showCut, setShowCut] = useState(false)
  const [showMachine, setShowMachine] = useState(true)
  const [time, setTime] = useState<number | null>(null) // machine minutes; null = whole plate, no simulation
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(300)

  const viewRef = useRef<HTMLDivElement>(null)
  const c3 = useRef<HTMLCanvasElement>(null)
  const c2 = useRef<HTMLCanvasElement>(null)
  const scene = useRef<PlateScene3d | null>(null)
  const fit = useRef<Fit | null>(null)

  const sim = time != null
  const { mm, state: headState } = sim ? stateAt(mp, time) : { mm: mp.totalMm, state: 'done' as const }
  const head = headAt(mp, mm)
  const st: SceneState & { mm: number } = {
    selected, explode, showRapid, showCut, showMachine, playing: sim, step: head.step, head: head.pt, headState, mm,
    partCut: i => finish[i] <= (time ?? Infinity),
  }

  // 3D scene lifetime: one per plate
  useEffect(() => {
    if (!c3.current || !webglOk) return
    const s = new PlateScene3d(c3.current, view, mp)
    s.onPick = m => setSelected(cur => (m && m !== cur ? m : null))
    scene.current = s
    const r = viewRef.current!.getBoundingClientRect()
    s.resize(r.width, r.height)
    return () => { s.dispose(); scene.current = null }
  }, [view, mp, webglOk])

  // draw on every state change
  useEffect(() => {
    if (mode === '3d') scene.current?.update(st)
    else if (c2.current) fit.current = drawPlate2d(c2.current, view, mp, st)
  })

  const stRef = useRef(st)
  useEffect(() => { stRef.current = st })
  useEffect(() => {
    const el = viewRef.current; if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      scene.current?.resize(r.width, r.height)
      if (c2.current && c2.current.style.display !== 'none') fit.current = drawPlate2d(c2.current, view, mp, stRef.current)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [view, mp])

  // playback on the machine clock: `speed` machine minutes per real minute
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = 0
    const tick = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0; last = now
      setTime(t => {
        const next = (t ?? 0) + (dt / 60) * speed
        if (next >= mp.totalMin) { setPlaying(false); return mp.totalMin }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, mp.totalMin])

  const play = () => { if (playing) return setPlaying(false); if (time == null || time >= mp.totalMin) setTime(0); setPlaying(true) }
  const reset = () => { setPlaying(false); setTime(null); setSelected(null); scene.current?.resetView() }
  const finished = finish.filter(f => f <= (time ?? Infinity)).length
  // The headline time is the report's (2026-11-10): the simulation has no marking, so its clock can run short
  const label = !sim || headState === 'done'
    ? `Whole plate · ${plateTimeLabel(view.machine?.totalMin ?? null, mp.totalMin)} · ${mp.pierces} pierces · ${mp.cutM.toFixed(1)} m cut`
    : `${STATE_LABEL[headState]} · simulation ${time!.toFixed(1)} / ${mp.totalMin.toFixed(1)} min · pierces ${head.pierces + (headState === 'rapid' ? 0 : 1)} / ${mp.pierces} · cut ${head.cutM.toFixed(1)} m · parts done ${finished} / ${view.parts.length}`

  const sel = selected ? byMark.get(selected) : null
  const countIn = (m: string) => view.parts.filter(p => p.mark === m).length
  const chk = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', cursor: 'pointer' } as const
  const btn = { fontSize: 12, padding: '4px 10px', border: '1px solid #E0E0E0', borderRadius: 6, background: 'white', cursor: 'pointer' } as const

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 12 }}>
      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #E8E8E8', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden' }}>
            {(['3d', '2d'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} disabled={m === '3d' && !webglOk} aria-pressed={mode === m}
                style={{ fontSize: 12, padding: '4px 12px', border: 'none', cursor: 'pointer', background: mode === m ? COLORS.accent : 'white', color: mode === m ? 'white' : '#333' }}>
                {m === '3d' ? '3D' : '2D layout'}
              </button>
            ))}
          </div>
          {mode === '3d' && <label style={chk}><input type="checkbox" checked={explode} onChange={e => setExplode(e.target.checked)} style={{ accentColor: COLORS.accent }} />Lift parts off the sheet</label>}
          <label style={chk}><input type="checkbox" checked={showRapid} onChange={e => setShowRapid(e.target.checked)} style={{ accentColor: COLORS.accent }} />Rapid moves + {mp.pierces} pierce points</label>
          <label style={chk}><input type="checkbox" checked={showCut} onChange={e => setShowCut(e.target.checked)} style={{ accentColor: COLORS.accent }} />Actual cut path</label>
          {mode === '3d' && <label style={chk}><input type="checkbox" checked={showMachine} onChange={e => setShowMachine(e.target.checked)} style={{ accentColor: COLORS.accent }} />Show CNC machine</label>}
          <span style={{ flex: 1 }} />
          <button onClick={reset} style={btn}>Reset view</button>
        </div>

        <div ref={viewRef} style={{ position: 'relative', height: 460, background: COLORS.canvas }}>
          <canvas ref={c3} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: mode === '3d' ? 'block' : 'none', touchAction: 'none' }} />
          <canvas ref={c2} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: mode === '2d' ? 'block' : 'none' }}
            onClick={e => {
              if (!fit.current) return
              const r = e.currentTarget.getBoundingClientRect(), m = pick2d(view, fit.current, e.clientX - r.left, e.clientY - r.top)
              setSelected(cur => (m && m !== cur ? m : null))
            }} />
          <div style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 11, color: '#6B6F76', background: 'white', border: '1px solid #E5E7EB', borderRadius: 4, padding: '2px 8px' }}>
            {mode === '3d' ? 'Drag to rotate · right-drag or Shift to pan · scroll to zoom · click a part for details' : 'Click a part for details'}
            {!webglOk && ' · 3D is not available on this device, showing 2D'}
          </div>
          {selected && (
            <div style={{ position: 'absolute', right: 10, top: 10, background: 'white', border: '1px solid #E5E7EB', borderLeft: `3px solid ${COLORS.accent}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, minWidth: 210, boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{selected}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 10px', marginTop: 4 }}>
                {sel && <><span style={{ color: '#8E8E8E' }}>Order</span><span>{sel.order_number} / item {sel.item}</span></>}
                <span style={{ color: '#8E8E8E' }}>On this plate</span><span>{countIn(selected)} pcs</span>
                {sel && <><span style={{ color: '#8E8E8E' }}>Ordered</span><span>{sel.ordered} pcs</span>
                  <span style={{ color: '#8E8E8E' }}>Size</span><span>{sel.length_mm} × {sel.width_mm} mm</span>
                  <span style={{ color: '#8E8E8E' }}>Weight</span><span>{sel.weight_kg} kg / pc</span></>}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid #E8E8E8', flexWrap: 'wrap' }}>
          <button onClick={play} style={{ ...btn, minWidth: 132 }}>{playing ? '⏸ Pause' : '▶ Simulate cutting'}</button>
          <input type="range" min={0} max={1000} aria-label="Position in the cutting sequence" value={sim ? Math.round((time! / mp.totalMin) * 1000) : 1000}
            onChange={e => { setPlaying(false); setTime((Number(e.target.value) / 1000) * mp.totalMin) }} style={{ flex: 1, minWidth: 160, accentColor: COLORS.accent }} />
          <select value={speed} onChange={e => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])} aria-label="Speed"
            style={{ fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 6, padding: '3px 6px' }}>
            {SPEEDS.map(s => <option key={s} value={s}>{s}×{s === 60 ? ' (1 s = 1 min)' : ''}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#6B6F76', fontVariantNumeric: 'tabular-nums', minWidth: 260 }}>{label}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B6F76' }}><i style={{ width: 16, height: 4, borderRadius: 2, background: COLORS.cut }} />Cut</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B6F76' }}><i style={{ width: 16, height: 4, borderRadius: 2, background: COLORS.rapid }} />Rapid</span>
        </div>
        {!view.machine && <div style={{ fontSize: 11, color: '#B45309', padding: '0 12px 8px' }}>No Machine times table in the .txt, so machine time uses defaults (cut 2,200 · rapid 10,000 mm/min · pierce 0.1 min)</div>}
      </div>

      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 568 }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #E8E8E8', fontSize: 13, fontWeight: 600, display: 'flex' }}>
          Parts on this plate<span style={{ flex: 1 }} /><span style={{ fontSize: 12, color: '#8E8E8E', fontWeight: 400 }}>{view.parts.length} pcs · {marks.length} {marks.length === 1 ? 'mark' : 'marks'}</span>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ color: '#8E8E8E', textAlign: 'left', position: 'sticky', top: 0, background: 'white' }}>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Part mark</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Size</th>
                <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>On plate / ordered</th>
              </tr>
            </thead>
            <tbody>
              {marks.map(m => {
                const o = byMark.get(m), n = countIn(m)
                return (
                  <tr key={m} onClick={() => setSelected(cur => (cur === m ? null : m))} aria-selected={selected === m}
                    style={{ cursor: 'pointer', borderTop: '1px solid #F0F0F0', background: selected === m ? '#FDECEC' : undefined }}>
                    <td style={{ padding: '5px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: markColor(marks, m), marginRight: 6, verticalAlign: 'middle' }} />{m}
                    </td>
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{o ? `${o.length_mm} x ${o.width_mm}` : '—'}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: o && n < (o.ordered ?? 0) ? COLORS.accent : undefined, fontWeight: o && n < (o.ordered ?? 0) ? 600 : 400 }}>
                      {n} / {o?.ordered ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#8E8E8E', padding: '8px 12px', borderTop: '1px solid #E8E8E8' }}>
          Red = this plate cuts fewer than ordered; the rest are on other plates
        </div>
      </div>
    </div>
  )
}
