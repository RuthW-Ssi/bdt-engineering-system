import { Plus, Trash2 } from 'lucide-react'
import type { PartMark } from '../../api/mo'
import { ui } from './PartUi'

// Round 3 marks table: one row per Dispatch Note mark (or typed). tw/tf are
// optional — blank means "take it from the Material List" (R4).

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
      {marks.length > 0 && (
        <table className={ui.table}>
          <thead>
            <tr>
              <th className={ui.th}>Mark</th>
              {NUM_FIELDS.map(f => <th key={f.key} className={ui.th}>{f.label}</th>)}
              <th className={`${ui.th} w-9`} />
            </tr>
          </thead>
          <tbody>
            {marks.map((m, i) => (
              <tr key={i}>
                <td className={ui.td}><input className={m.mark.trim() ? ui.input : ui.inputBad} value={m.mark} onChange={e => patch(i, { mark: e.target.value })} /></td>
                {NUM_FIELDS.map(f => (
                  <td key={f.key} className={ui.td}>
                    <input type="number" min={0} className={`${ui.input} font-mono`} placeholder={f.placeholder} value={(m[f.key] as number | null | undefined) ?? ''}
                      onChange={e => patch(i, { [f.key]: e.target.value === '' ? (f.key === 'set_qty' ? 0 : null) : Number(e.target.value) } as Partial<PartMark>)} />
                  </td>
                ))}
                <td className={ui.td}>
                  <button type="button" aria-label={`ลบ mark ${m.mark}`} onClick={() => onChange(marks.filter((_, k) => k !== i))} className={ui.iconBtn}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className={`${ui.btnAdd} mt-2`} onClick={() => onChange([...marks, { mark: '', set_qty: 1, length_mm: null, width_mm: null, height_mm: null }])}>
        <Plus size={13} /> เพิ่ม mark
      </button>
    </div>
  )
}
