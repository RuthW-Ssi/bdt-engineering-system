import { useState } from 'react'
import { Check } from 'lucide-react'
import type { AsmField, Conflict, MergeResult, PartField, Pick } from '../../../lib/bomPreshop'

// Old vs new after a re-upload (2026-11-23) — same card idea as the MO
// pre-shop compare (PreshopMergeCompare): click the card to use.
const LABEL: Record<AsmField | PartField, string> = {
  qty: 'ชุด', name: 'Name', length_mm: 'L (mm)', width_mm: 'W (mm)', height_mm: 'H (mm)', weight_kg: 'kg / ชุด', surface_area_m2: 'area / ชุด',
  profile: 'Profile', grade: 'Grade', unit_weight_kg: 'kg / ชิ้น', no: 'No.',
}
const TAG = {
  old: { bg: '#F0F0F0', fg: '#555', text: 'เดิม' },
  new: { bg: '#E6F1FB', fg: '#0C447C', text: 'ใหม่ (จากไฟล์)' },
  own: { bg: '#FAEEDA', fg: '#854F0B', text: 'กำหนดเอง' },
}
// text fields stay text, the rest are numbers
const TEXT_FIELDS = new Set<string>(['name', 'profile', 'grade'])
const show = (v: string | number | null) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : v)

function Card({ kind, value, active, onClick }: { kind: 'old' | 'new'; value: string | number | null; active: boolean; onClick: () => void }) {
  const t = TAG[kind]
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{ flex: 1, minWidth: 140, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: '#fff', textAlign: 'left',
        border: active ? '2px solid #C8202A' : '1px solid #D4D4D4', boxShadow: active ? '0 0 0 3px #FCEBEB' : 'none' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: t.bg, color: t.fg }}>{t.text}</span>
        <span style={{ width: 18, height: 18, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: active ? 'none' : '1.5px solid #C2C2C2', background: active ? '#C8202A' : '#fff' }}>
          {active && <Check size={12} color="#fff" strokeWidth={3} />}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{show(value)}</div>
    </button>
  )
}

function OwnCard({ field, mark, pick, onChange }: { field: string; mark: string; pick: Pick | undefined; onChange: (p: Pick) => void }) {
  const active = typeof pick === 'object' && pick != null
  const text = active ? String(pick.own ?? '') : ''
  const isText = TEXT_FIELDS.has(field)
  return (
    <div style={{ flex: 1, minWidth: 140, padding: '8px 10px', borderRadius: 8, background: '#fff', border: active ? '2px solid #C8202A' : '1px solid #D4D4D4', boxShadow: active ? '0 0 0 3px #FCEBEB' : 'none' }}>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: TAG.own.bg, color: TAG.own.fg }}>{TAG.own.text}</span>
      <input aria-label={`กำหนดเอง ${LABEL[field as AsmField | PartField]} ${mark}`} type={isText ? 'text' : 'number'} value={text} placeholder="พิมพ์ค่า"
        onChange={e => onChange({ own: e.target.value.trim() === '' ? null : isText ? e.target.value : Number(e.target.value) })}
        style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '4px 6px', fontSize: 13, fontWeight: 700, border: '1px solid #D4D4D4', borderRadius: 5 }} />
    </div>
  )
}

export function PreshopMergeDialog({ file, result, onCancel, onConfirm }: {
  file: string
  result: MergeResult
  onCancel: () => void
  onConfirm: (picks: Record<string, Pick>, remove: string[]) => void
}) {
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [missing, setMissing] = useState<Record<string, 'keep' | 'remove'>>({})
  const byMark = new Map<string, Conflict[]>()
  for (const c of result.conflicts) byMark.set(`${c.kind}:${c.mark}`, [...(byMark.get(`${c.kind}:${c.mark}`) ?? []), c])
  const ready = result.conflicts.every(c => picks[c.id]) && result.missing.every(m => missing[m])
  const added = result.state.asm.filter(a => a.src === 'dn').length + result.state.parts.filter(p => p.src === 'pl').length

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.35)', zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-label="Compare with file" style={{ width: 'min(760px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', background: '#fff', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>เทียบกับไฟล์ {file}</div>
        <div style={{ fontSize: 12.5, color: '#767676', marginBottom: 14 }}>
          ค่าไหนต่างจากเดิม เลือกว่าจะใช้ค่าเดิมหรือค่าใหม่ · part ที่ใส่ assembly ไว้แล้วยังอยู่เหมือนเดิม{added ? ` · เพิ่มใหม่ ${added} รายการ` : ''}
        </div>
        {[...byMark.entries()].map(([k, list]) => (
          <div key={k} style={{ border: '1px solid #E8E8E8', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{list[0].mark}</div>
            {list.map(c => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>{LABEL[c.field]}</div>
                <div className="flex flex-wrap" style={{ gap: 8 }}>
                  <Card kind="old" value={c.old} active={picks[c.id] === 'old'} onClick={() => setPicks(p => ({ ...p, [c.id]: 'old' }))} />
                  <Card kind="new" value={c.new} active={picks[c.id] === 'new'} onClick={() => setPicks(p => ({ ...p, [c.id]: 'new' }))} />
                  <OwnCard field={c.field} mark={c.mark} pick={picks[c.id]} onChange={v => setPicks(p => ({ ...p, [c.id]: v }))} />
                </div>
              </div>
            ))}
          </div>
        ))}
        {result.missing.length > 0 && (
          <div style={{ border: '1px solid #FAEEDA', background: '#FFFBF3', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#854F0B', marginBottom: 6 }}>ไม่มีในไฟล์นี้แล้ว — เก็บไว้หรือเอาออก</div>
            {result.missing.map(m => (
              <div key={m} className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 110 }}>{m}</span>
                {(['keep', 'remove'] as const).map(v => (
                  <button key={v} type="button" aria-label={`${v === 'keep' ? 'Keep' : 'Remove'} ${m}`} onClick={() => setMissing(s => ({ ...s, [m]: v }))}
                    style={{ padding: '4px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: `1px solid ${missing[m] === v ? '#C8202A' : '#D4D4D4'}`, background: missing[m] === v ? '#FCEBEB' : '#fff', color: missing[m] === v ? '#C8202A' : '#555' }}>
                    {v === 'keep' ? 'เก็บไว้' : 'เอาออก'}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end" style={{ gap: 8, marginTop: 6 }}>
          <button type="button" onClick={onCancel} style={{ height: 34, padding: '0 16px', fontSize: 13, color: '#555', background: '#fff', border: '1px solid #C2C2C2', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          <button type="button" disabled={!ready} onClick={() => onConfirm(picks, result.missing.filter(m => missing[m] === 'remove'))}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 34, padding: '0 20px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#C8202A', border: 'none', borderRadius: 6 }}>OK</button>
        </div>
      </div>
    </div>
  )
}
