import { FAMILY_COLOR, type BacklogView } from '../../lib/schedule'
import { STUB } from './styles'

/** Backlog list: one card per MO with schedulable WOs outside this version, plus the "not silently hidden" notes. */
export function BacklogPanel({ view }: { view: BacklogView }) {
  return (
    <div className="p-2 overflow-y-auto max-h-[420px]">
      {view.emptyText && <div className={STUB}>{view.emptyText}</div>}
      {view.cards.map((c) => (
        <div key={c.moId} data-testid="backlog-card" className="border border-[#E0E0E0] rounded-[9px] p-2 mb-2 bg-white">
          <div className="flex items-baseline gap-1.5">
            <b className="text-[13px] text-[#1F1F1F]">{c.moCode}</b>
            <span className="text-[11px] text-[#555555]">
              {c.prefix ? `${c.prefix} · ` : ''}
              {c.opCount} ops
            </span>
          </div>
          <div className="flex gap-[5px] flex-wrap my-1.5">
            <span
              className={`text-[10px] rounded-[5px] px-1.5 py-0.5 ${c.urgent ? 'bg-[#FCEBEB] text-[#b91c1c] font-bold' : 'bg-[#F5F5F5] text-[#555555]'}`}
              data-urgent={c.urgent || undefined}
            >
              ⏱ {c.due}
            </span>
            <span className="text-[10px] rounded-[5px] px-1.5 py-0.5 bg-[#F5F5F5] text-[#555555]">{c.sumHText}</span>
          </div>
          <div className="flex gap-0.5 flex-wrap">
            {c.route.map((r) => (
              <span
                key={r.woId}
                title={r.label}
                className="w-[17px] h-[14px] rounded-[3px] text-white text-[9px] font-bold flex items-center justify-center"
                style={{ background: FAMILY_COLOR[r.family] }}
              >
                {r.letter}
              </span>
            ))}
          </div>
        </div>
      ))}
      {view.notes.map((n) => (
        <div key={n} className={STUB}>{n}</div>
      ))}
    </div>
  )
}
