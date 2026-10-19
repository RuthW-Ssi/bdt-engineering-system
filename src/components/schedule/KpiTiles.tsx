import { LATE_COLOR, UI_COLOR, type KpiTile, type KpiTone } from '../../lib/schedule'

const TONE_COLOR: Record<KpiTone, string> = {
  accent: UI_COLOR.accent,
  bad: LATE_COLOR.ink,
  good: UI_COLOR.green,
  '': UI_COLOR.ink,
}

/** The four KPIs (on-time % per MO · late MOs · backlog MOs · finish time) as one compact strip. */
export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
      {tiles.map((t) => (
        <div key={t.key} data-testid={`kpi-${t.key}`} className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-bold leading-none" style={{ color: TONE_COLOR[t.tone] }}>{t.value}</span>
          <span className="text-[11px] text-[#6b7682]">{t.label}</span>
        </div>
      ))}
    </div>
  )
}
