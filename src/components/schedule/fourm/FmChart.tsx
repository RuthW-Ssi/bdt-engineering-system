import { FOURM_CHART, type FmChartDay } from '../../../lib/schedule'

/**
 * .sc4 — one group of shift bars (เช้า · บ่าย · โอที) per working day, bottom-
 * aligned in a 62 px area, the day under each group; scrolls sideways on long
 * spans. A bar is one colour (`fill`) or stacked segments, bottom → top; its
 * value is the hover tooltip and, as role="img", the accessible name.
 */
export function FmChart({ days }: { days: FmChartDay[] }) {
  return (
    <div className="flex items-end gap-2.5 h-20 overflow-x-auto pt-1 border-b border-[#d8dde3]">
      {days.map((d) => (
        <div key={d.day} data-testid="fm-day" className="flex flex-none flex-col items-center gap-[3px]">
          <div className="flex items-end gap-0.5" style={{ height: FOURM_CHART.barAreaPx }}>
            {d.bars.map((b) => (
              <div
                key={b.key}
                role="img"
                aria-label={b.title}
                title={b.title}
                className="flex flex-col-reverse overflow-hidden rounded-t-[2px]"
                style={{ width: FOURM_CHART.barW, height: b.heightPx, background: b.fill ?? 'none' }}
              >
                {/* segments are positional: '?' can be both a top label and the folded rest */}
                {b.fill == null && b.segs.map((s, i) => <div key={i} style={{ height: s.heightPx, background: s.color, flexShrink: 0 }} />)}
              </div>
            ))}
          </div>
          <div className="text-[9px] leading-[10px] text-[#6b7682] whitespace-nowrap">{d.label}</div>
        </div>
      ))}
    </div>
  )
}
