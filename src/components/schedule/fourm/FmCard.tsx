import { FOURM_CHIP_COLOR, type FourMCard } from '../../../lib/schedule'
import { FmChart } from './FmChart'
import { FM_BOX, FM_STUB } from './styles'

/** One 4M card (.fmrow): title + tag, chips, the per-shift chart or a message, legend. */
export function FmCard({ card }: { card: FourMCard }) {
  return (
    <section aria-label={card.title} data-testid={`fm-${card.key}`} className={FM_BOX}>
      <h4 className="m-0 mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#1f2733]">
        {card.title}
        <span className="ml-auto font-mono text-[10px] font-normal text-[#6b7682] text-right">{card.tag}</span>
      </h4>
      <div className="flex flex-wrap gap-[5px] mb-2.5">
        {card.chips.map((c) => (
          <span
            key={c.text}
            data-tone={c.tone || undefined}
            className="text-[10px] px-[7px] py-0.5 rounded-[5px]"
            style={{ background: FOURM_CHIP_COLOR[c.tone].bg, color: FOURM_CHIP_COLOR[c.tone].fg }}
          >
            {c.text}
          </span>
        ))}
      </div>
      {card.chart ? <FmChart days={card.chart} /> : <div className={FM_STUB}>{card.message}</div>}
      {(card.legend.length > 0 || card.legendNote !== '') && (
        <div className="flex flex-wrap gap-2.5 mt-[7px] text-[10px] text-[#6b7682]">
          {card.legend.map((l) => (
            <span key={l.label}>
              <span aria-hidden className="inline-block w-[9px] h-[9px] rounded-[2px] align-[-1px] mr-[3px]" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          {card.legendNote && <span className="ml-auto">{card.legendNote}</span>}
        </div>
      )}
    </section>
  )
}
