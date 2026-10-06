import type { PartLine } from '../../api/mo'
import { compareSizes } from '../../lib/moPartMatch'

// Round 3 R3: live comparison of plates expected from the marks vs the
// Material List. Differences are highlighted only — never blocks saving.

const CELL: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #F0F0F0', fontSize: 12 }
const HEAD: React.CSSProperties = { ...CELL, fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', textAlign: 'left', background: '#FAFAFA' }

export function SizeComparisonPanel({ lines, materialList }: { lines: PartLine[]; materialList: PartLine[] }) {
  const rows = compareSizes(lines, materialList)
  const diffs = rows.filter(r => r.diff !== 0)
  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 6, color: diffs.length ? '#A15C00' : '#15803D', fontWeight: 600 }}>
        {diffs.length ? `ต่างกัน ${diffs.length} ขนาด — ตรวจและแก้ในตารางรายการแผ่น` : 'จาก mark ตรงกับ Material List ทุกขนาด'}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={HEAD}>Profile</th><th style={HEAD}>Grade</th><th style={HEAD}>ยาว</th>
            <th style={{ ...HEAD, textAlign: 'right' }}>จาก mark</th><th style={{ ...HEAD, textAlign: 'right' }}>ใน Material List</th><th style={{ ...HEAD, textAlign: 'right' }}>ต่าง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.profile}|${r.grade}|${r.length_mm}`} style={{ background: r.diff !== 0 ? '#FFF8E1' : undefined }}>
              <td style={CELL}>{r.profile}</td><td style={CELL}>{r.grade}</td><td style={CELL}>{r.length_mm}</td>
              <td style={{ ...CELL, textAlign: 'right' }}>{r.from_marks}</td>
              <td style={{ ...CELL, textAlign: 'right' }}>{r.from_list ?? '—'}</td>
              <td style={{ ...CELL, textAlign: 'right', fontWeight: r.diff ? 700 : 400, color: r.diff ? '#A15C00' : '#999' }}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
