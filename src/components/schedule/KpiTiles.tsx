import { LATE_COLOR, UI_COLOR, type KpiTile, type KpiTone } from '../../lib/schedule'

const TONE_COLOR: Record<KpiTone, string> = {
  accent: UI_COLOR.accent,
  bad: LATE_COLOR.ink,
  good: UI_COLOR.green,
  '': UI_COLOR.ink,
}

/** The four KPI tiles (on-time % per MO · late MOs · backlog MOs · finish time). */
export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div key={t.key} data-testid={`kpi-${t.key}`} className="bg-white border border-[#d8dde3] rounded-[10px] px-3.5 py-3">
          <div className="text-[22px] font-bold leading-none" style={{ color: TONE_COLOR[t.tone] }}>{t.value}</div>
          <div className="text-[11px] text-[#6b7682] mt-1.5">{t.label}</div>
        </div>
      ))}
    </div>
  )
}
