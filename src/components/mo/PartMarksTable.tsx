import { Plus, Trash2 } from 'lucide-react'
import type { PartMark } from '../../api/mo'

// Round 3 marks table: one row per Dispatch Note mark (or typed). tw/tf are
// optional — blank means "take it from the Material List" (R4).

const CELL: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #F0F0F0', fontSize: 12 }
const HEAD: React.CSSProperties = { ...CELL, fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', textAlign: 'left', background: '#FAFAFA' }
const INPUT: React.CSSProperties = { width: '100%', padding: '4px 6px', borderRadius: 5, fontSize: 12, border: '1px solid #D4D4D4' }

const NUM_FIELDS: { key: keyof PartMark; label: string; placeholder?: string }[] = [
  { key: 'set_qty', label: 'Set' },
  { key: 'length_mm', label: 'L (mm)' },
  { key: 'width_mm', label: 'W (mm)' },
  { key: 'height_mm', label: 'H (mm)' },
  { key: 'weight_kg', label: 'น้ำหนัก (kg)' },
  { key: 'tw_mm', label: 'tw', placeholder: 'อัตโนมัติ' },
  { key: 'tf_mm', label: 'tf', placeholder: 'อัตโนมัติ' },
]

export function PartMarksTable({ marks, onChange }: { marks: PartMark[]; onChange: (marks: PartMark[]) => void }) {
  const patch = (i: number, p: Partial<PartMark>) => onChange(marks.map((m, k) => (k === i ? { ...m, ...p } : m)))
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={HEAD}>Mark</th>
            {NUM_FIELDS.map(f => <th key={f.key} style={HEAD}>{f.label}</th>)}
            <th style={{ ...HEAD, width: 36 }} />
          </tr>
        </thead>
        <tbody>
          {marks.map((m, i) => (
            <tr key={i}>
              <td style={CELL}><input style={{ ...INPUT, border: m.mark.trim() ? INPUT.border : '1px solid #C8202A' }} value={m.mark} onChange={e => patch(i, { mark: e.target.value })} /></td>
              {NUM_FIELDS.map(f => (
                <td key={f.key} style={CELL}>
                  <input type="number" min={0} style={INPUT} placeholder={f.placeholder} value={(m[f.key] as number | null | undefined) ?? ''}
                    onChange={e => patch(i, { [f.key]: e.target.value === '' ? (f.key === 'set_qty' ? 0 : null) : Number(e.target.value) } as Partial<PartMark>)} />
                </td>
              ))}
              <td style={CELL}>
                <button type="button" aria-label={`ลบ mark ${m.mark}`} onClick={() => onChange(marks.filter((_, k) => k !== i))} style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer', display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => onChange([...marks, { mark: '', set_qty: 1, length_mm: null, width_mm: null, height_mm: null }])}
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '5px 10px', borderRadius: 6, border: '1px dashed #BBB', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
        <Plus size={13} /> เพิ่ม mark
      </button>
    </div>
  )
}
