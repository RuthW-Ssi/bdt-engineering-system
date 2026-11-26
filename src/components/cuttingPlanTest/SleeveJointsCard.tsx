import { Check } from 'lucide-react'
import type { SleeveJoint } from '../../api/cutting-plan-test'
import { plugText, plugWeldProblem, sizeKey } from '../../lib/cuttingPlanTest/plugWeld'
import type { PlugSettings, PlugWeld } from '../../lib/cuttingPlanTest/plugWeld'
import { InfoTip } from '../bom/InfoTip'

// CP-Shape-Test (Tao 2026-11-26): the sleeve joints of the project (from its model) and the plug-weld holes of each
// pipe size as parameters. The numbers start as a suggestion; Confirm puts them on the cutting report.
const card = { background: 'white', border: '1px solid #E0E0E0', borderRadius: 8 } as const
const input = { height: 28, width: 64, fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 6px', background: 'white' } as const
const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })
const marksOf = (m: string[], fallback: string) => (m.length ? m.join(' / ') : fallback)

export function SleeveJointsCard({ source, joints, settings, onChange }: { source: string; joints: SleeveJoint[]; settings: PlugSettings; onChange: (s: PlugSettings) => void }) {
  const sizes = [...new Set(joints.flatMap(j => j.pipes.map(p => sizeKey(p.profile))))].sort()
  const pipesOf = (k: string) => joints.flatMap(j => j.pipes.filter(p => sizeKey(p.profile) === k))
  const problemOf = (k: string, p: PlugWeld) => pipesOf(k).map(x => plugWeldProblem(p, x.odMm, x.insertMm)).find(Boolean) ?? null
  const set = (k: string, patch: Partial<PlugWeld>) => onChange({ ...settings, [k]: { params: { ...settings[k].params, ...patch }, confirmed: false } }) // a changed number needs confirming again
  const td = { padding: '6px 12px', whiteSpace: 'nowrap' } as const
  const drawnSame = joints.filter(j => j.sleeveDrawnAtPipeSize).reduce((n, j) => n + j.count, 0)
  return (
    <div data-testid="sleeve-joints" style={{ ...card, padding: 0 }}>
      <div style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600 }}>
        Sleeve joints <span style={{ fontSize: 12, fontWeight: 400, color: '#6B7280' }}>{`· ${joints.reduce((n, j) => n + j.count, 0)} sleeves in the model (${source}) · plug-weld holes per pipe size`}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 11 }}>
          {['Pipe size', 'Hole Ø (mm)', 'Holes per pipe end', 'From pipe end (mm)', 'First hole at (°)', 'Holes', ''].map(h => <th key={h} style={{ ...td, fontWeight: 500, borderTop: '1px solid #F3F4F6' }}>{h}{h === 'Holes per pipe end' && <span style={{ marginLeft: 4, display: 'inline-flex', verticalAlign: 'middle' }}><InfoTip label="About plug-weld holes" text="Each pipe of a joint gets this many holes round it, over the sleeve inside, welded full. The numbers start as a suggestion (hole = wall + 8 mm; half way along the sleeve). Check them against the drawing, then Confirm: only confirmed holes are printed on the cutting report." /></span>}</th>)}
        </tr></thead>
        <tbody>
          {sizes.map(k => {
            const s = settings[k]
            if (!s) return null
            const problem = problemOf(k, s.params)
            const num = (label: string, field: keyof PlugWeld) => (
              <input type="number" aria-label={`${label} ${k}`} value={Number.isFinite(s.params[field]) ? s.params[field] : ''} min={0}
                onChange={e => set(k, { [field]: Number(e.target.value) })} style={input} />
            )
            return (
              <tr key={k} data-testid={`plug-${k}`} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={{ ...td, fontWeight: 600 }}>{k}</td>
                <td style={td}>{num('Hole diameter', 'holeDiaMm')}</td>
                <td style={td}>{num('Holes per pipe end', 'holesPerSide')}</td>
                <td style={td}>{num('From pipe end', 'fromEndMm')}</td>
                <td style={td}>{num('First hole angle', 'startAngleDeg')}</td>
                <td style={{ ...td, whiteSpace: 'normal', color: problem ? '#991B1B' : '#374151' }}>{problem ?? plugText(s.params)}</td>
                <td style={td}>
                  {s.confirmed
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#166534', fontWeight: 600 }}><Check size={13} />Confirmed</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 999, padding: '1px 8px', fontWeight: 600 }}>Suggested</span>
                        <button disabled={!!problem} onClick={() => onChange({ ...settings, [k]: { ...s, confirmed: true } })} aria-label={`Confirm holes of ${k}`} className="disabled:opacity-40"
                          style={{ height: 26, padding: '0 10px', fontSize: 12, fontWeight: 600, border: '1px solid #C2C2C2', borderRadius: 6, background: 'white', cursor: 'pointer' }}>Confirm</button>
                      </span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, borderTop: '1px solid #E5E7EB' }}>
        <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 11 }}>
          {['Joints', 'Sleeve', 'Pipe', 'Sleeve goes in', 'Pipe', 'Sleeve goes in', 'Assemblies'].map((h, i) => <th key={i} style={{ ...td, fontWeight: 500 }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {joints.map((j, i) => (
            <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
              <td style={td}>{`× ${j.count}`}</td>
              <td style={td}><b>{marksOf(j.sleeve.marks, 'not in the BOM')}</b> <span style={{ color: '#6B7280' }}>{`${j.sleeve.profile} · Ø${mm(j.sleeve.odMm)} · ${mm(j.sleeve.lengthMm)} mm`}</span></td>
              {[0, 1].flatMap(n => {
                const p = j.pipes[n]
                return p
                  ? [<td key={`p${n}`} style={td}><b>{marksOf(p.marks, 'not in the BOM')}</b> <span style={{ color: '#6B7280' }}>{`Ø${mm(p.odMm)} · ${mm(p.lengthMm)} mm`}</span></td>, <td key={`i${n}`} style={td}>{`${mm(p.insertMm)} mm`}</td>]
                  : [<td key={`p${n}`} style={{ ...td, color: '#9CA3AF' }}>—</td>, <td key={`i${n}`} style={td} />]
              })}
              <td style={{ ...td, color: '#6B7280' }}>{j.assemblies.slice(0, 3).join(', ')}{j.assemblies.length > 3 ? `, +${j.assemblies.length - 3}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {drawnSame > 0 && <div style={{ padding: '8px 12px 12px', fontSize: 11, color: '#92400E' }}>{`${drawnSame} sleeves are drawn in the model at their pipe's own size: check the real sleeve size with the shop.`}</div>}
    </div>
  )
}
