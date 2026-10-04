import { SCHEDULE_TEXT, type HeatGrid } from '../../lib/schedule'
import { STUB } from './styles'

/** 🔥 every active WC × every working day on the axis: load ÷ (lines × 705 min × OEE), plus an OEE column. */
export function UtilizationHeatmap({ grid }: { grid: HeatGrid | null }) {
  if (!grid) return <div className={STUB}>{SCHEDULE_TEXT.heatEmpty}</div>
  return (
    <div className="px-3.5 py-2.5 overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="px-1.5 py-[5px] text-left font-medium text-[#1f2733] whitespace-nowrap">Work Center</th>
            {grid.days.map((d) => (
              <th key={d.day} className="px-1.5 py-[5px] font-medium text-[#6b7682] text-center whitespace-nowrap">{d.label}</th>
            ))}
            <th className="px-1.5 py-[5px] font-medium text-[#6b7682] text-center">OEE</th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => (
            <tr key={r.wc.id}>
              <td className="px-1.5 text-left whitespace-nowrap font-medium text-[#1f2733]">{r.code}</td>
              {r.cells.map((c) => (
                <td key={c.day} className="p-0 text-center">
                  <div
                    title={c.title}
                    className="h-[30px] min-w-[40px] rounded-[5px] m-0.5 flex items-center justify-center font-semibold"
                    style={{ background: c.color, color: c.lightBg ? '#5a6470' : '#fff' }}
                  >
                    {c.text}
                  </div>
                </td>
              ))}
              <td className="text-center text-[10px] text-[#6b7682]">{r.oeeText}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-[#6b7682] mt-1.5">{grid.note}</div>
    </div>
  )
}
