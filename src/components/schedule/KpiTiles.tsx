import { Info } from 'lucide-react'
import { LATE_COLOR, UI_COLOR, type KpiTile, type KpiTone } from '../../lib/schedule'

const TONE_COLOR: Record<KpiTone, string> = {
  accent: UI_COLOR.warn,
  bad: LATE_COLOR.ink,
  good: UI_COLOR.green,
  '': UI_COLOR.ink,
}

/** The KPIs (on-time % per MO · late MOs, ⓘ lists their assemblies · backlog MOs · finish time · op count · version) as one compact strip. */
export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
      {tiles.map((t) => (
        <div key={t.key} data-testid={`kpi-${t.key}`} className="flex items-baseline gap-1.5">
          <span
            className={`leading-none ${t.key === 'version' ? 'text-[13px] font-semibold font-mono' : 'text-[17px] font-bold'}`}
            style={{ color: TONE_COLOR[t.tone] }}
          >
            {t.value}
          </span>
          <span className="text-[11px] text-[#555555]">{t.label}</span>
          {t.items && (
            <span className="group relative self-center inline-flex">
              <button
                type="button"
                aria-label={`รายการ${t.label}`}
                className="inline-flex border-0 bg-transparent p-0 cursor-help text-[#8E8E8E] hover:text-[#b91c1c] focus:text-[#b91c1c] outline-none"
              >
                <Info size={13} />
              </button>
              <div
                role="tooltip"
                className="hidden group-hover:block group-focus-within:block absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-30 min-w-[180px] max-w-[360px] max-h-64 overflow-y-auto rounded-md bg-[#1F1F1F] text-white text-[11px] px-2.5 py-2 shadow-[0_4px_8px_rgba(0,0,0,0.18)]"
              >
                <div className="font-semibold mb-1">{t.label} · {t.items.length} assembly</div>
                {t.items.map((m) => <div key={m} className="leading-relaxed whitespace-nowrap">{m}</div>)}
              </div>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
