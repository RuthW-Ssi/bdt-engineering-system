import { Plus, Trash2 } from 'lucide-react'
import type { PreshopPart } from '../../api/mo'

// Editable part list of one pre-shop assembly, per set (2026-10-08, user:
// "part ก็ต้องแก้ไขได้ด้วย"). Used in the Upload modal and the MO's
// Assemblies tab; `locked` marks parts already on a WO (no delete).

const cell: React.CSSProperties = { padding: '3px 4px' }
const input: React.CSSProperties = { width: '100%', padding: '3px 6px', fontSize: 12, border: '1px solid #D4D4D4', borderRadius: 5, background: '#fff' }
const head: React.CSSProperties = { ...cell, textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase' }

export function PreshopPartsEditor({ parts, onChange, sets, locked }: {
  parts: PreshopPart[]
  onChange: (parts: PreshopPart[]) => void
  sets?: number // shows the total column when known
  locked?: Set<string>
}) {
  const patch = (i: number, p: Partial<PreshopPart>) => onChange(parts.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const numIn = (v: string) => (v === '' ? 0 : Number(v))
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...head, minWidth: 110 }}>Part</th>
            <th style={{ ...head, minWidth: 110 }}>Profile</th>
            <th style={{ ...head, width: 80 }}>Grade</th>
            <th style={{ ...head, width: 90 }}>L (mm)</th>
            <th style={{ ...head, width: 70 }}>ต่อชุด</th>
            {sets != null && <th style={{ ...head, width: 70, textAlign: 'right' }}>รวม</th>}
            <th style={{ ...head, width: 90 }}>kg / ชิ้น</th>
            <th style={{ ...head, width: 26 }} />
          </tr>
        </thead>
        <tbody>
          {parts.map((p, i) => (
            <tr key={i}>
              <td style={cell}><input style={{ ...input, fontFamily: 'monospace', fontWeight: 600 }} value={p.part_mark} disabled={locked?.has(p.part_mark)} onChange={e => patch(i, { part_mark: e.target.value })} /></td>
              <td style={cell}><input style={input} value={p.profile} onChange={e => patch(i, { profile: e.target.value })} /></td>
              <td style={cell}><input style={input} value={p.grade} onChange={e => patch(i, { grade: e.target.value })} /></td>
              <td style={cell}><input type="number" min={0} style={input} value={p.length_mm || ''} onChange={e => patch(i, { length_mm: numIn(e.target.value) })} /></td>
              <td style={cell}><input type="number" min={0} style={{ ...input, ...(p.qty > 0 ? {} : { borderColor: '#C8202A' }) }} value={p.qty || ''} onChange={e => patch(i, { qty: numIn(e.target.value) })} /></td>
              {sets != null && <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{p.qty * sets}</td>}
              <td style={cell}><input type="number" min={0} style={input} value={p.unit_weight_kg || ''} onChange={e => patch(i, { unit_weight_kg: numIn(e.target.value) })} /></td>
              <td style={cell}>
                {locked?.has(p.part_mark)
                  ? <span title="มีใน WO แล้ว — ลบไม่ได้" style={{ fontSize: 10.5, color: '#999' }}>WO</span>
                  : (
                    <button type="button" aria-label={`ลบ ${p.part_mark}`} onClick={() => onChange(parts.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', display: 'flex' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => onChange([...parts, { part_mark: '', profile: '', grade: '', length_mm: 0, qty: 1, unit_weight_kg: 0 }])}
        className="flex items-center gap-1" style={{ marginTop: 6, padding: '4px 9px', fontSize: 12, fontWeight: 600, color: '#C8202A', background: '#fff', border: '1px dashed #E8A0A0', borderRadius: 6, cursor: 'pointer' }}>
        <Plus size={12} /> เพิ่ม part
      </button>
    </div>
  )
}
