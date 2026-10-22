import { SCHEDULE_TEXT, type Bottleneck } from '../../lib/schedule'
import { STUB } from './styles'

const FILL = 'linear-gradient(180deg,#185FA5,#0C447C)'
const FILL_OVER = 'linear-gradient(180deg,#dc2626,#991b1b)'

/** ⚡ work hours per axis day of the bottleneck WC against its capacity line (dashed). */
export function BottleneckLoad({ data }: { data: Bottleneck | null }) {
  if (!data) return <div className={STUB}>{SCHEDULE_TEXT.loadEmpty}</div>
  return (
    <div className="px-3.5 pt-5 pb-7 overflow-x-auto">
      <div className="flex items-end gap-3.5 h-[120px] border-b-2 border-[#E0E0E0] relative pt-1.5">
        {data.days.map((d) => (
          <div key={d.day} data-testid="load-day" className="flex-1 min-w-[34px] flex flex-col items-center justify-end h-full relative">
            <div className="w-3/5 rounded-t-[5px] relative" style={{ height: `${d.fillPct}%`, background: d.over ? FILL_OVER : FILL }}>
              <span
                className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold font-mono whitespace-nowrap"
                style={{ color: d.over ? '#b91c1c' : '#0C447C' }}
              >
                {d.hoursText}
              </span>
            </div>
            <div className="absolute left-0 right-0 border-t-2 border-dashed border-[#b91c1c]" style={{ bottom: `${data.capBottomPct}%` }} />
            <div className="absolute top-full mt-1 text-[10px] text-[#555555] whitespace-nowrap">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
