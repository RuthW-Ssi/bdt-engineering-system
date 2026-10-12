import { Plus, Trash2 } from 'lucide-react'
import type { PartLine } from '../../api/mo'
import { duplicateGroups, mergeRows, rowErrors, totalWeight } from '../../lib/moPartLines'
import { ui } from './PartUi'

// MO Part review table (wiki features/mo-part-import-plan §5): every source
// pre-fills these rows; the user can then edit, add and delete freely (D2).

const EMPTY_ROW: PartLine = { profile: '', grade: '', length_mm: 0, qty: 0, unit_weight_kg: null }

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const holesText = (h: PartLine['holes']) => (h?.length ? h.map(x => `${x.count}×Ø${x.diameter_mm}`).join(', ') : '')

export function PartLinesReviewTable({ lines, onChange, marks = [] }: { lines: PartLine[]; onChange: (lines: PartLine[]) => void; marks?: string[] }) {
  const errors = rowErrors(lines, marks.length ? marks : undefined)
  const dupes = duplicateGroups(lines)

  function patch(i: number, p: Partial<PartLine>) {
    onChange(lines.map((l, k) => (k === i ? { ...l, ...p } : l)))
  }
  const cls = (i: number, word: string) => ((errors.get(i) ?? []).some(e => e.startsWith(word)) ? ui.inputBad : ui.input)
  const numOrZero = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <div>
      {dupes.map(g => (
        <div key={g.join('-')} className={`${ui.warn} mb-2 flex items-center gap-3`}>
          <span>แถว {g.map(i => i + 1).join(' และ ')} ขนาดเดียวกัน</span>
          <button type="button" className={ui.btnOutlineRed} onClick={() => onChange(mergeRows(lines, g))}>รวมแถว</button>
        </div>
      ))}

      <div className={ui.scrollBox}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th className={`${ui.th} w-8`}>#</th>
              {marks.length > 0 && <th className={ui.th}>Mark</th>}
              <th className={ui.th}>Profile</th>
              <th className={ui.th}>Grade</th>
              <th className={ui.th}>ยาว (mm)</th>
              <th className={ui.th}>จำนวน</th>
              <th className={ui.th}>น้ำหนัก/ชิ้น (kg)</th>
              <th className={ui.thRight}>น้ำหนักรวม (kg)</th>
              <th className={ui.th}>Part mark</th>
              <th className={ui.th}>รูเจาะ</th>
              <th className={ui.thRight}>แนวตัด (m)</th>
              <th className={`${ui.th} w-9`} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} title={(errors.get(i) ?? []).join(' · ') || undefined} className="hover:bg-chrome-50">
                <td className={ui.tdMuted}>{i + 1}</td>
                {marks.length > 0 && (
                  <td className={ui.td}>
                    <select className={`${cls(i, 'mark')} min-w-[110px]`} value={l.mark ?? ''} onChange={e => patch(i, { mark: e.target.value || null })}>
                      <option value="">— ไม่ระบุ —</option>
                      {marks.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                )}
                <td className={ui.td}><input className={cls(i, 'profile')} value={l.profile} onChange={e => patch(i, { profile: e.target.value })} /></td>
                <td className={ui.td}><input className={cls(i, 'grade')} value={l.grade} onChange={e => patch(i, { grade: e.target.value })} /></td>
                <td className={ui.td}><input type="number" min={0} className={`${cls(i, 'length')} font-mono`} value={l.length_mm || ''} onChange={e => patch(i, { length_mm: numOrZero(e.target.value) })} /></td>
                <td className={ui.td}><input type="number" min={0} step={1} className={`${cls(i, 'qty')} font-mono`} value={l.qty || ''} onChange={e => patch(i, { qty: numOrZero(e.target.value) })} /></td>
                <td className={ui.td}><input type="number" min={0} className={`${cls(i, 'weight')} font-mono`} value={l.unit_weight_kg ?? ''} onChange={e => patch(i, { unit_weight_kg: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td className={`${ui.tdRight} text-chrome-600`}>{l.unit_weight_kg == null ? '—' : fmt(Number(l.qty) * Number(l.unit_weight_kg))}</td>
                <td className={`${ui.tdMuted} max-w-[180px] truncate`}>{l.part_mark ?? ''}</td>
                <td className={`${ui.td} whitespace-nowrap text-chrome-600`}>{holesText(l.holes)}</td>
                <td className={`${ui.tdRight} text-chrome-600`}>{l.cut_length_mm == null ? '' : (Number(l.cut_length_mm) / 1000).toFixed(2)}</td>
                <td className={ui.td}>
                  <button type="button" aria-label={`ลบแถว ${i + 1}`} className={ui.iconBtn} onClick={() => onChange(lines.filter((_, k) => k !== i))}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button type="button" className={ui.btnAdd} onClick={() => onChange([...lines, { ...EMPTY_ROW }])}>
          <Plus size={13} /> เพิ่มแถว
        </button>
        <div className="flex gap-4 text-xs text-chrome-600">
          <span>{lines.length} แถว</span>
          <span>รวม <strong className="text-chrome-900">{lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}</strong> ชิ้น</span>
          <span>น้ำหนักรวม <strong className="text-chrome-900">{fmt(totalWeight(lines))}</strong> kg</span>
          {lines.some(l => l.holes?.length) && <span>รูเจาะ <strong className="text-chrome-900">{lines.reduce((s, l) => s + (Number(l.qty) || 0) * (l.holes ?? []).reduce((a, h) => a + h.count, 0), 0)}</strong> รู</span>}
          {lines.some(l => l.cut_length_mm != null) && <span>แนวตัด <strong className="text-chrome-900">{fmt(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cut_length_mm) || 0), 0) / 1000)}</strong> m</span>}
        </div>
      </div>
    </div>
  )
}
