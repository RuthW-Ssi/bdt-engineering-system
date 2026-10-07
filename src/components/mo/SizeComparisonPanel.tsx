import type { PartLine } from '../../api/mo'
import { compareSizes } from '../../lib/moPartMatch'
import { ui } from './PartUi'

// Round 3 R3: live comparison of plates expected from the marks vs the
// Material List. Differences are highlighted only — never blocks saving.

export function SizeComparisonPanel({ lines, materialList }: { lines: PartLine[]; materialList: PartLine[] }) {
  const rows = compareSizes(lines, materialList)
  const diffs = rows.filter(r => r.diff !== 0)
  return (
    <div>
      <div className={`mb-2 ${diffs.length ? 'text-xs font-semibold text-molten-600' : ui.ok}`}>
        {diffs.length ? `ต่างกัน ${diffs.length} ขนาด — ตรวจและแก้ในตารางรายการแผ่น` : 'จาก mark ตรงกับ Material List ทุกขนาด'}
      </div>
      <table className={ui.table}>
        <thead>
          <tr>
            <th className={ui.th}>Profile</th>
            <th className={ui.th}>Grade</th>
            <th className={ui.thRight}>ยาว (mm)</th>
            <th className={ui.thRight}>จาก mark</th>
            <th className={ui.thRight}>ใน Material List</th>
            <th className={ui.thRight}>ต่าง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.profile}|${r.grade}|${r.length_mm}`} className={r.diff !== 0 ? 'bg-molten-50' : undefined}>
              <td className={ui.td}>{r.profile}</td>
              <td className={ui.td}>{r.grade}</td>
              <td className={ui.tdRight}>{r.length_mm}</td>
              <td className={ui.tdRight}>{r.from_marks}</td>
              <td className={ui.tdRight}>{r.from_list ?? '—'}</td>
              <td className={`${ui.tdRight} ${r.diff ? 'font-bold text-molten-600' : 'text-chrome-400'}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
