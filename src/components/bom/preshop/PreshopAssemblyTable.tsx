import { useState } from 'react'
import { ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { addLink, newKey, type EdAsm, type EditorState } from '../../../lib/bomPreshop'

const COLS = '22px minmax(0,1.3fr) 64px minmax(0,1fr) 76px 64px 64px 80px 84px 56px 30px'
const MEMBER_COLS = 'minmax(0,1.2fr) minmax(0,1.2fr) 64px 64px 64px 52px 64px 26px'
const HD: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#767676', textTransform: 'uppercase', letterSpacing: '.04em' }
const IN: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '4px 6px', fontSize: 12.5, border: '1px solid #D4D4D4', borderRadius: 5, background: '#fff', color: '#1F1F1F' }
const MONO: React.CSSProperties = { ...IN, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }
const num = (v: number | null) => (v == null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }))
const toNum = (v: string) => (v.trim() === '' ? null : Number(v))

export const PART_DRAG_TYPE = 'text/plain'

export function PreshopAssemblyTable({ state, onChange, dragging }: { state: EditorState; onChange: (s: EditorState) => void; dragging: string | null }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [over, setOver] = useState<string | null>(null)

  const patch = (key: string, p: Partial<EdAsm>) => onChange({ ...state, asm: state.asm.map(a => (a.key === key ? { ...a, ...p } : a)) })
  const remove = (key: string) => onChange({ ...state, asm: state.asm.filter(a => a.key !== key), links: state.links.filter(l => l.asmKey !== key) })
  const add = () => {
    const key = newKey('a')
    onChange({ ...state, asm: [...state.asm, { key, src: 'own', mark: '', qty: 1, name: null, length_mm: null, width_mm: null, height_mm: null, weight_kg: null, surface_area_m2: null }] })
    setOpen(o => ({ ...o, [key]: true }))
  }
  const drop = (e: React.DragEvent, asmKey: string) => {
    e.preventDefault()
    setOver(null)
    const partKey = e.dataTransfer.getData(PART_DRAG_TYPE) || dragging
    if (!partKey || !state.parts.some(p => p.key === partKey)) return
    onChange(addLink(state, partKey, asmKey))
    setOpen(o => ({ ...o, [asmKey]: true }))
  }

  const totalSets = state.asm.reduce((s, a) => s + (a.qty || 0), 0)

  return (
    <div style={{ flex: '999 1 640px', minWidth: 0, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 16px' }}>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Assembly ({state.asm.length})</div>
        <div style={{ fontSize: 11.5, color: '#767676' }}>ลาก part จากด้านขวามาวางที่ assembly</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 760 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '6px 0', borderBottom: '1px solid #E0E0E0', alignItems: 'center' }}>
            <span /><span style={HD}>Assembly mark</span><span style={HD}>ชุด</span><span style={HD}>Name</span><span style={HD}>L (mm)</span><span style={HD}>W (mm)</span>
            <span style={HD}>H (mm)</span><span style={HD}>kg / ชุด</span><span style={HD}>area / ชุด</span><span style={HD}>Part</span><span />
          </div>
          {state.asm.map(a => {
            const links = state.links.filter(l => l.asmKey === a.key)
            const isOpen = !!open[a.key]
            const isOver = over === a.key
            const label = a.mark || 'assembly'
            return (
              <div key={a.key} data-testid={`asm-row-${a.mark}`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (over !== a.key) setOver(a.key) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null) }}
                onDrop={e => drop(e, a.key)}
                style={{ borderBottom: '1px solid #F0F0F0', borderRadius: 6, outline: `2px solid ${isOver ? '#C8202A' : 'transparent'}`, outlineOffset: -2, background: isOver ? '#FFF5F5' : a.src === 'own' ? '#FFFDF7' : 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '6px 0', alignItems: 'center' }}>
                  <button type="button" aria-label={`${isOpen ? 'Hide' : 'Show'} parts of ${label}`} onClick={() => setOpen(o => ({ ...o, [a.key]: !isOpen }))}
                    style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#767676', cursor: 'pointer', padding: 0 }}>
                    <ChevronRight size={14} style={{ transition: 'transform .15s', transform: `rotate(${isOpen ? 90 : 0}deg)` }} />
                  </button>
                  <input aria-label="Assembly mark" style={MONO} value={a.mark} placeholder="mark" onChange={e => patch(a.key, { mark: e.target.value })} />
                  <input aria-label="ชุด" type="number" min={0} style={{ ...IN, borderColor: a.qty > 0 ? '#D4D4D4' : '#C8202A' }} value={a.qty || ''} placeholder="กรอก"
                    onChange={e => patch(a.key, { qty: Number(e.target.value) || 0 })} />
                  <input aria-label="Name" style={IN} value={a.name ?? ''} onChange={e => patch(a.key, { name: e.target.value })} />
                  <input aria-label="L (mm)" type="number" style={IN} value={a.length_mm ?? ''} onChange={e => patch(a.key, { length_mm: toNum(e.target.value) })} />
                  <input aria-label="W (mm)" type="number" style={IN} value={a.width_mm ?? ''} onChange={e => patch(a.key, { width_mm: toNum(e.target.value) })} />
                  <input aria-label="H (mm)" type="number" style={IN} value={a.height_mm ?? ''} onChange={e => patch(a.key, { height_mm: toNum(e.target.value) })} />
                  <input aria-label="kg / ชุด" type="number" style={IN} value={a.weight_kg ?? ''} onChange={e => patch(a.key, { weight_kg: toNum(e.target.value) })} />
                  <input aria-label="area / ชุด" type="number" style={IN} value={a.surface_area_m2 ?? ''} onChange={e => patch(a.key, { surface_area_m2: toNum(e.target.value) })} />
                  {links.length === 0
                    ? <button type="button" data-testid="asm-part-count" onClick={() => setOpen(o => ({ ...o, [a.key]: true }))}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#C8202A', textAlign: 'left' }}>ใส่ part</button>
                    : <span data-testid="asm-part-count" style={{ fontSize: 12.5, color: '#555' }}>{links.length}</span>}
                  <button type="button" aria-label={`Delete ${label}`} onClick={() => remove(a.key)}
                    style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#C8202A', cursor: 'pointer', padding: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {a.src === 'own' && <div style={{ padding: '0 0 6px 28px', fontSize: 11, color: '#767676' }}>กรอกเอง</div>}
                {isOpen && (
                  <div style={{ margin: '0 0 10px 28px', padding: '8px 10px', background: '#FAFAFA', borderRadius: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: MEMBER_COLS, gap: 6, paddingBottom: 4, alignItems: 'center' }}>
                      <span style={HD}>Part</span><span style={HD}>Profile</span><span style={HD}>Grade</span><span style={HD}>L (mm)</span>
                      <span style={HD}>ต่อชุด</span><span style={{ ...HD, textAlign: 'right' }}>รวม</span><span style={HD}>kg / ชิ้น</span><span />
                    </div>
                    {links.map(l => {
                      const p = state.parts.find(x => x.key === l.partKey)
                      if (!p) return null
                      return (
                        <div key={l.partKey} style={{ display: 'grid', gridTemplateColumns: MEMBER_COLS, gap: 6, padding: '3px 0', alignItems: 'center', fontSize: 12 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{p.part_mark || '(no mark)'}</span>
                          <span>{p.profile}</span>
                          <span>{p.grade}</span>
                          <span>{num(p.length_mm)}</span>
                          <input aria-label={`จำนวนต่อชุด ${p.part_mark}`} type="number" min={1} style={IN} value={l.qty || ''}
                            onChange={e => onChange({ ...state, links: state.links.map(x => (x === l ? { ...x, qty: Number(e.target.value) || 0 } : x)) })} />
                          <span style={{ textAlign: 'right', fontWeight: 700 }}>{(l.qty || 0) * (a.qty || 0)}</span>
                          <span>{num(p.unit_weight_kg)}</span>
                          <button type="button" aria-label={`Take ${p.part_mark} out of ${label}`} onClick={() => onChange({ ...state, links: state.links.filter(x => x !== l) })}
                            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#8E8E8E', cursor: 'pointer', padding: 0 }}>
                            <X size={13} />
                          </button>
                        </div>
                      )
                    })}
                    <div style={{ marginTop: 6, padding: 8, textAlign: 'center', fontSize: 12, border: `1.5px dashed ${isOver ? '#C8202A' : '#D4D4D4'}`, borderRadius: 6, color: isOver ? '#C8202A' : '#767676' }}>
                      ลาก part มาวางที่นี่
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <button type="button" onClick={add} className="inline-flex items-center gap-1"
        style={{ marginTop: 10, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#C8202A', background: '#fff', border: '1px dashed #E8A0A0', borderRadius: 6, cursor: 'pointer' }}>
        <Plus size={13} /> Add assembly
      </button>
      <div style={{ fontSize: 12, color: '#555', marginTop: 10 }}>
        Total <strong>{state.asm.length}</strong> assembly · <strong>{totalSets}</strong> ชุด · <strong>{state.links.length}</strong> part in assemblies
      </div>
    </div>
  )
}
