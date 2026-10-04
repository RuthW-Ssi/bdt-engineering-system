import { useId, useMemo } from 'react'
import type { ScheduleFourM } from '../../../api/schedule'
import { getErrorMessage } from '../../../lib/getErrorMessage'
import { FOURM_TEXT, fourMView, type BoardIndex, type SchedOp } from '../../../lib/schedule'
import { BTN, ERROR_BOX } from '../styles'
import { FmCard } from './FmCard'
import { FM_BOX, FM_STUB } from './styles'

/**
 * 📊 4M + WIP analysis under the board grid: Man · Machine · Material · Method
 * · WIP per shift over the version's scheduled working days (lib/schedule
 * fourMView). `data` comes from useScheduleFourM, which loads after the board;
 * until data of the board's version is in, a loading stub (or the error with
 * a retry) stands in for the cards.
 */
export function FourMSection({
  ix,
  ops,
  data,
  isError,
  error,
  onRetry,
}: {
  ix: BoardIndex
  ops: readonly SchedOp[]
  data: ScheduleFourM | undefined
  isError: boolean
  error: unknown
  onRetry: () => void
}) {
  const headingId = useId()
  const view = useMemo(() => fourMView(ix, ops, data), [ix, ops, data])

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <h3 className="m-0 mt-1 mb-2 text-sm font-semibold text-[#1f2733]">
        <span aria-hidden>{FOURM_TEXT.icon}</span> <span id={headingId}>{FOURM_TEXT.heading}</span>{' '}
        <span className="text-[11px] font-normal text-[#6b7682]">{FOURM_TEXT.sub}</span>
      </h3>
      <div className="flex flex-col gap-2.5">
        {view.state === 'ready' ? (
          view.cards.map((c) => <FmCard key={c.key} card={c} />)
        ) : view.state === 'loading' && isError ? (
          <div className={`${FM_BOX} flex flex-col items-center gap-2 py-4`}>
            <div role="alert" className={ERROR_BOX}>
              {FOURM_TEXT.error}: {getErrorMessage(error, 'Failed to load the 4M data.')}
            </div>
            <button type="button" className={BTN} onClick={onRetry}>
              {FOURM_TEXT.retry}
            </button>
          </div>
        ) : (
          <div className={FM_BOX}>
            <div className={FM_STUB}>{view.text}</div>
          </div>
        )}
      </div>
    </section>
  )
}
