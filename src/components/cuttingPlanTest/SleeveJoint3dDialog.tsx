import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { SleeveJoint } from '../../api/cutting-plan-test'
import { jointSpec, plugText, sizeKey } from '../../lib/cuttingPlanTest/plugWeld'
import type { PlugSettings } from '../../lib/cuttingPlanTest/plugWeld'
import type { SleeveJointScene } from './sleeveJointScene'

// CP-Shape-Test (Tao 2026-11-26): one sleeve joint in 3D — the two pipes, the sleeve inside, the plug-weld holes.
const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })
const hasWebgl = () => { try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false } }
const name = (marks: string[], fallback: string) => (marks.length ? marks.join(' / ') : fallback)

export function SleeveJoint3dDialog({ joint, settings, onClose }: { joint: SleeveJoint; settings: PlugSettings; onClose: () => void }) {
  const [webgl] = useState(hasWebgl)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<SleeveJointScene | null>(null)
  const spec = jointSpec(joint, settings)
  const title = `Sleeve joint · ${name(joint.sleeve.marks, joint.sleeve.profile)}`

  useEffect(() => {
    if (!webgl || !canvas.current) return
    let gone = false
    const c = canvas.current
    const ro = new ResizeObserver(() => scene.current?.resize(c.clientWidth, c.clientHeight))
    import('./sleeveJointScene').then(({ SleeveJointScene }) => { // three.js only loads when a joint is opened
      if (gone) return
      scene.current = new SleeveJointScene(c, spec)
      scene.current.resize(c.clientWidth, c.clientHeight)
      ro.observe(c)
    })
    return () => { gone = true; ro.disconnect(); scene.current?.dispose(); scene.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl, JSON.stringify(spec)])

  const sw = (color: string) => <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color, marginRight: 6 }} />
  const td = { padding: '6px 10px', borderTop: '1px solid #F3F4F6' } as const
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 10, width: 'min(1000px, 94vw)', maxHeight: '92vh', overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{title}</div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'inline-flex' }}><X size={18} /></button>
        </div>
        {webgl
          ? <canvas ref={canvas} style={{ width: '100%', height: 400, borderRadius: 6, display: 'block' }} />
          : <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', borderRadius: 6, fontSize: 12, color: '#6B7280' }}>3D needs WebGL in this browser</div>}
        <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>Drag to rotate · scroll to zoom</span>
          <span>{sw('#5b7fa6')}Pipes (see-through)</span><span>{sw('#0f9d8a')}Sleeve inside</span><span>{sw('#111827')}Plug-weld hole</span><span>{sw('#f97316')}Weld</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}>{['Piece', 'Mark', 'Size', 'Sleeve goes in', 'Plug-weld holes'].map(h => <th key={h} style={{ padding: '6px 10px', fontWeight: 500 }}>{h}</th>)}</tr></thead>
            <tbody>
              <tr><td style={td}>Sleeve</td><td style={{ ...td, fontWeight: 600 }}>{name(joint.sleeve.marks, 'not in the BOM')}</td><td style={td}>{`${joint.sleeve.profile} · Ø${mm(spec.sleeve.odMm)} · ${mm(joint.sleeve.lengthMm)} mm`}</td><td style={td} /><td style={td} /></tr>
              {joint.pipes.map((p, i) => {
                const s = settings[sizeKey(p.profile)]
                return (
                  <tr key={i}>
                    <td style={td}>{`Pipe ${i + 1}`}</td><td style={{ ...td, fontWeight: 600 }}>{name(p.marks, 'not in the BOM')}</td>
                    <td style={td}>{`${p.profile} · Ø${mm(p.odMm)} · ${mm(p.lengthMm)} mm`}</td><td style={td}>{`${mm(p.insertMm)} mm`}</td>
                    <td style={td}>{s ? <>{plugText(s.params)} <span style={{ color: s.confirmed ? '#166534' : '#92400E', fontWeight: 600 }}>{s.confirmed ? '· Confirmed' : '· Suggested'}</span></> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {joint.sleeveDrawnAtPipeSize && <div style={{ fontSize: 11, color: '#92400E' }}>{`The model draws this sleeve at its pipe's own size (Ø${mm(joint.sleeve.odMm)}); it is shown here as the tube that fits inside (Ø${mm(spec.sleeve.odMm)}).`}</div>}
      </div>
    </div>
  )
}
