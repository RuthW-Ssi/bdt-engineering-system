import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { newKey, usage, type EditorState } from '../../../lib/bomPreshop'
import { PART_DRAG_TYPE } from './PreshopAssemblyTable'

const IN: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '4px 6px', fontSize: 12.5, border: '1px solid #D4D4D4', borderRadius: 5, background: '#fff', color: '#1F1F1F' }
const MONO: React.CSSProperties = { ...IN, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }
const EMPTY_DRAFT = { part_mark: '', profile: '', grade: '', length_mm: '', unit_weight_kg: '' }

const Grip = () => (
  <svg width="12" height="16" viewBox="0 0 12 16" fill="#B0B0B0" aria-hidden="true" style={{ flexShrink: 0 }}>
    {[3, 8, 13].flatMap(y => [<circle key={`a${y}`} cx="3" cy={y} r="1.4" />, <circle key={`b${y}`} cx="9" cy={y} r="1.4" />])}
  </svg>
)

export function PreshopPartPool({ state, onChange, dragging, onDragging }: {
  state: EditorState
  onChange: (s: EditorState) => void
  dragging: string | null
  onDragging: (key: string | null) => void
}) {
  const [filter, setFilter] = useState<'all' | 'unused'>('all')
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT | null>(null)

  const rows = state.parts.map(p => ({ p, u: usage(state, p.key) }))
  const unused = rows.filter(r => r.u.asmMarks.length === 0).length
  const shown = filter === 'all' ? rows : rows.filter(r => r.u.asmMarks.length === 0)
  const pill = (on: boolean): React.CSSProperties => ({ padding: '3px 10px', fontSize: 12, fontWeight: 600, borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? '#C8202A' : '#D4D4D4'}`, background: on ? '#FEF2F2' : '#fff', color: on ? '#C8202A' : '#555' })

  const patch = (key: string, p: Partial<EditorState['parts'][number]>) =>
    onChange({ ...state, parts: state.parts.map(x => (x.key === key ? { ...x, ...p } : x)) })
  const toNum = (v: string) => (v.trim() === '' ? null : Number(v))
  const addPart = () => {
    if (!draft) return
    const n = (v: string) => (v.trim() === '' ? null : Number(v))
    onChange({ ...state, parts: [...state.parts, { key: newKey('p'), src: 'own', part_mark: draft.part_mark.trim(), profile: draft.profile.trim(), grade: draft.grade.trim(), length_mm: n(draft.length_mm), unit_weight_kg: n(draft.unit_weight_kg), no: null }] })
    setDraft(null)
  }

  return (
    <div style={{ flex: '1 1 320px', minWidth: 0, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 4 }}>Part list ({state.parts.length})</div>
      <div style={{ fontSize: 11.5, color: '#767676', marginBottom: 8 }}>part เดียวกันลากไปใส่ได้หลาย assembly · part mark ชั่วคราวใส่ได้ แก้ทีหลังได้</div>
      <div className="flex" style={{ gap: 6, marginBottom: 10 }}>
        <button type="button" style={pill(filter === 'all')} onClick={() => setFilter('all')}>All ({state.parts.length})</button>
        <button type="button" style={pill(filter === 'unused')} onClick={() => setFilter('unused')}>Not in an assembly ({unused})</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 560, overflowY: 'auto' }}>
        {shown.map(({ p, u }) => {
          const used = u.asmMarks.length > 0
          const color = !used ? '#C8202A' : u.over ? '#854F0B' : '#27500A'
          const text = !used
            ? 'Not in an assembly'
            : `In ${u.asmMarks.length} assembly (${u.asmMarks.join(', ')}) · ${u.pcs}${p.no != null ? ` / ${p.no}` : ''} pcs${u.over ? ' · over the Part List qty' : ''}`
          const detail = [p.no != null ? `No. ${p.no}` : '', p.src === 'own' ? 'เพิ่มเอง' : '']
            .filter(Boolean).join(' · ')
          return (
            <div key={p.key} data-testid={`part-card-${p.part_mark}`} draggable
              onDragStart={e => { e.dataTransfer.setData(PART_DRAG_TYPE, p.key); e.dataTransfer.effectAllowed = 'copy'; onDragging(p.key) }}
              onDragEnd={() => onDragging(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'grab', background: '#fff', border: '1px solid #E0E0E0', opacity: dragging === p.key ? 0.5 : 1 }}>
              <Grip />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div className="flex items-center" style={{ gap: 6 }}>
                  <input aria-label="Part mark" style={{ ...MONO, padding: '2px 6px' }} value={p.part_mark} placeholder="เช่น TMP-01"
                    onChange={e => patch(p.key, { part_mark: e.target.value })} />
                  {!used && (
                    <button type="button" aria-label={`Delete ${p.part_mark || 'part'}`} onClick={() => onChange({ ...state, parts: state.parts.filter(x => x.key !== p.key) })}
                      style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#C8202A', cursor: 'pointer', padding: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {/* everything is editable by hand (spec) — a blank kg or L would otherwise block Save with no way out */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 4 }}>
                  <input aria-label="Profile" style={{ ...IN, padding: '2px 5px', fontSize: 11.5 }} value={p.profile} placeholder="Profile" onChange={e => patch(p.key, { profile: e.target.value })} />
                  <input aria-label="Grade" style={{ ...IN, padding: '2px 5px', fontSize: 11.5 }} value={p.grade} placeholder="Grade" onChange={e => patch(p.key, { grade: e.target.value })} />
                  <input aria-label="L (mm)" type="number" style={{ ...IN, padding: '2px 5px', fontSize: 11.5 }} value={p.length_mm ?? ''} placeholder="L (mm)" onChange={e => patch(p.key, { length_mm: toNum(e.target.value) })} />
                  <input aria-label="kg / ชิ้น" type="number" style={{ ...IN, padding: '2px 5px', fontSize: 11.5 }} value={p.unit_weight_kg ?? ''} placeholder="kg / ชิ้น" onChange={e => patch(p.key, { unit_weight_kg: toNum(e.target.value) })} />
                </div>
                <span style={{ fontSize: 11.5, color: '#555' }}>{detail}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color }}>{text}</span>
              </div>
            </div>
          )
        })}
        {shown.length === 0 && (
          <div style={{ fontSize: 12, color: '#767676', padding: 12, textAlign: 'center', border: '1px dashed #E0E0E0', borderRadius: 6 }}>
            {filter === 'unused' && state.parts.length ? 'Every part is in an assembly' : 'No parts yet · upload a Part List or add one'}
          </div>
        )}
      </div>
      {draft ? (
        <div style={{ marginTop: 10, padding: 10, border: '1px solid #E0E0E0', borderRadius: 6, background: '#FAFAFA', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
          <input aria-label="New part mark" style={MONO} placeholder="Part mark เช่น TMP-01" value={draft.part_mark} onChange={e => setDraft({ ...draft, part_mark: e.target.value })} />
          <input aria-label="New part profile" style={IN} placeholder="Profile" value={draft.profile} onChange={e => setDraft({ ...draft, profile: e.target.value })} />
          <input aria-label="New part grade" style={IN} placeholder="Grade" value={draft.grade} onChange={e => setDraft({ ...draft, grade: e.target.value })} />
          <input aria-label="New part L (mm)" style={IN} type="number" placeholder="L (mm)" value={draft.length_mm} onChange={e => setDraft({ ...draft, length_mm: e.target.value })} />
          <input aria-label="New part kg / ชิ้น" style={IN} type="number" placeholder="kg / ชิ้น" value={draft.unit_weight_kg} onChange={e => setDraft({ ...draft, unit_weight_kg: e.target.value })} />
          <div className="flex justify-end" style={{ gridColumn: 'span 2', gap: 6 }}>
            <button type="button" onClick={() => setDraft(null)} style={{ padding: '4px 10px', fontSize: 12, color: '#555', background: '#fff', border: '1px solid #C2C2C2', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={addPart} style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#C8202A', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Add</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setDraft(EMPTY_DRAFT)} className="inline-flex items-center gap-1"
          style={{ marginTop: 10, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#C8202A', background: '#fff', border: '1px dashed #E8A0A0', borderRadius: 6, cursor: 'pointer' }}>
          <Plus size={13} /> Add part
        </button>
      )}
    </div>
  )
}
