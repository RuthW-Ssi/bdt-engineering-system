import { Calendar } from 'lucide-react'

// Same format as ProjectList.tsx's fmtDate (desktop) — kept as a local copy,
// matching this repo's convention of a small per-file duplicate over a
// shared date-format util (every other list/detail page does the same).
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

interface Props {
  title: string
  start: string | null
  end: string | null
}

// Identity card used at the top of both MobileZoneList (project "code -
// name" + start_date/target_handover) and MobileAssemblyList (zone "code -
// name" + target_erection_start/end) — same shape, different source fields.
export function MobileDateRangeCard({ title, start, end }: Props) {
  return (
    <div className="bg-white border border-chrome-100 rounded-xl p-4">
      <div className="font-semibold text-chrome-900 text-[17px] truncate">{title}</div>
      <div className="flex items-center gap-1.5 text-chrome-400 mt-1" style={{ fontSize: 12 }}>
        <Calendar size={12} className="flex-shrink-0" />
        {start && end ? (
          <span>{fmtDate(start)} → {fmtDate(end)}</span>
        ) : start ? (
          <span>Start {fmtDate(start)}</span>
        ) : end ? (
          <span>Due {fmtDate(end)}</span>
        ) : (
          <span>No dates set</span>
        )}
      </div>
    </div>
  )
}
