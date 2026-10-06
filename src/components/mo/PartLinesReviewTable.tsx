import { Plus, Trash2 } from 'lucide-react'
import type { PartLine } from '../../api/mo'
import { duplicateGroups, mergeRows, rowErrors, totalWeight } from '../../lib/moPartLines'

// MO Part review table (wiki features/mo-part-import-plan §5): every source
// pre-fills these rows; the user can then edit, add and delete freely (D2).

const CELL: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #F0F0F0', fontSize: 12 }
const HEAD: React.CSSProperties = { ...CELL, fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', textAlign: 'left', background: '#FAFAFA' }
const INPUT: React.CSSProperties = { width: '100%', padding: '4px 6px', borderRadius: 5, fontSize: 12, border: '1px solid #D4D4D4' }
const INPUT_BAD: React.CSSProperties = { ...INPUT, border: '1px solid #C8202A', background: '#FFF5F5' }

const EMPTY_ROW: PartLine = { profile: '', grade: '', length_mm: 0, qty: 0, unit_weight_kg: null }

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PartLinesReviewTable({ lines, onChange }: { lines: PartLine[]; onChange: (lines: PartLine[]) => void }) {
  const errors = rowErrors(lines)
  const dupes = duplicateGroups(lines)

  function patch(i: number, p: Partial<PartLine>) {
    onChange(lines.map((l, k) => (k === i ? { ...l, ...p } : l)))
  }
  const has = (i: number, word: string) => (errors.get(i) ?? []).some(e => e.startsWith(word))
  const numOrZero = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <div>
      {dupes.map(g => (
        <div key={g.join('-')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', marginBottom: 6, borderRadius: 6, background: '#FFF8E1', border: '1px solid #F5D77A', fontSize: 12 }}>
          <span>แถว {g.map(i => i + 1).join(' และ ')} ขนาดเดียวกัน</span>
          <button type="button" onClick={() => onChange(mergeRows(lines, g))} style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid #C8202A', color: '#C8202A', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            รวมแถว
          </button>
        </div>
      ))}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...HEAD, width: 32 }}>#</th>
            <th style={HEAD}>Profile</th>
            <th style={HEAD}>Grade</th>
            <th style={HEAD}>ยาว (mm)</th>
            <th style={HEAD}>จำนวน</th>
            <th style={HEAD}>น้ำหนัก/ชิ้น (kg)</th>
            <th style={{ ...HEAD, textAlign: 'right' }}>น้ำหนักรวม (kg)</th>
            <th style={HEAD}>Part mark</th>
            <th style={{ ...HEAD, width: 36 }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} title={(errors.get(i) ?? []).join(' · ') || undefined}>
              <td style={{ ...CELL, color: '#999' }}>{i + 1}</td>
              <td style={CELL}><input style={has(i, 'profile') ? INPUT_BAD : INPUT} value={l.profile} onChange={e => patch(i, { profile: e.target.value })} /></td>
              <td style={CELL}><input style={has(i, 'grade') ? INPUT_BAD : INPUT} value={l.grade} onChange={e => patch(i, { grade: e.target.value })} /></td>
              <td style={CELL}><input type="number" min={0} style={has(i, 'length') ? INPUT_BAD : INPUT} value={l.length_mm || ''} onChange={e => patch(i, { length_mm: numOrZero(e.target.value) })} /></td>
              <td style={CELL}><input type="number" min={0} step={1} style={has(i, 'qty') ? INPUT_BAD : INPUT} value={l.qty || ''} onChange={e => patch(i, { qty: numOrZero(e.target.value) })} /></td>
              <td style={CELL}><input type="number" min={0} style={has(i, 'weight') ? INPUT_BAD : INPUT} value={l.unit_weight_kg ?? ''} onChange={e => patch(i, { unit_weight_kg: e.target.value === '' ? null : Number(e.target.value) })} /></td>
              <td style={{ ...CELL, textAlign: 'right', color: '#555' }}>{l.unit_weight_kg == null ? '—' : fmt(Number(l.qty) * Number(l.unit_weight_kg))}</td>
              <td style={{ ...CELL, color: '#888', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.part_mark ?? ''}</td>
              <td style={CELL}>
                <button type="button" aria-label={`ลบแถว ${i + 1}`} onClick={() => onChange(lines.filter((_, k) => k !== i))} style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer', display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <button type="button" onClick={() => onChange([...lines, { ...EMPTY_ROW }])} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px dashed #BBB', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
          <Plus size={13} /> เพิ่มแถว
        </button>
        <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 16 }}>
          <span>{lines.length} แถว</span>
          <span>รวม {lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)} ชิ้น</span>
          <span>น้ำหนักรวม {fmt(totalWeight(lines))} kg</span>
        </div>
      </div>
    </div>
  )
}
