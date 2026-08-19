import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'

// Replaces native <input type="date"> — its rendered value is locale/OS
// text we don't control, and on a real device it overflowed its box no
// matter what CSS (width, max-width, min-width:0, overflow-x:hidden on
// every ancestor) was thrown at it — a Thai Buddhist-era WebView render
// like "23 Jul BE 2569" apparently isn't contained by normal box-model
// rules at all on that browser. Everything below is fully custom-rendered
// (no native date chrome anywhere), so that failure mode can't recur —
// this is a visual polish pass over the plain 3-<select> version, not a
// return to the native widget.
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
const MONTH_OPTIONS = MONTH_LABEL.map((label, i) => ({ value: i + 1, label }))

const ITEM_H = 40
const VISIBLE_ROWS = 5
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2)
const WHEEL_H = ITEM_H * VISIBLE_ROWS

function formatDisplay(v: string) {
  const [y, m, d] = v.split('-').map(Number)
  return `${d} ${MONTH_LABEL[m - 1]} ${y}`
}

// One column of an iOS-style scroll wheel — CSS scroll-snap does the actual
// snapping/inertia (well-supported in both the Android and iOS WebViews
// this app runs in); this just reads back which item settled in the center
// band after the user's gesture stops, debounced off onScroll since
// 'scrollend' isn't reliably available in-WebView.
function WheelColumn({ options, value, onSettle }: {
  options: { value: number; label: string }[]
  value: number
  onSettle: (v: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number>(undefined)
  const index = Math.max(0, options.findIndex(o => o.value === value))

  // Initial scroll position only — once mounted, every further scroll is
  // the user's own gesture; re-running this on `value` changes would fight
  // their finger mid-drag.
  useEffect(() => {
    ref.current?.scrollTo({ top: index * ITEM_H, behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => { if (settleTimer.current) window.clearTimeout(settleTimer.current) }, [])

  const handleScroll = () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.min(Math.max(Math.round(el.scrollTop / ITEM_H), 0), options.length - 1)
      const v = options[i]?.value
      if (v != null) onSettle(v)
    }, 80)
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-thin"
      style={{ height: WHEEL_H, scrollSnapType: 'y mandatory' }}
    >
      <div style={{ height: ITEM_H * PAD_ROWS }} />
      {options.map(o => (
        <div
          key={o.value}
          className={`flex items-center justify-center text-[16px] ${o.value === value ? 'text-chrome-900 font-semibold' : 'text-chrome-400'}`}
          style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
        >
          {o.label}
        </div>
      ))}
      <div style={{ height: ITEM_H * PAD_ROWS }} />
    </div>
  )
}

function MobileDateWheelSheet({ label, value, onDone, onClose }: {
  label: string
  value: string
  onDone: (v: string | null) => void
  onClose: () => void
}) {
  const now = new Date()
  const initial = value
    ? (() => { const [y, m, d] = value.split('-').map(Number); return { d, m, y } })()
    : { d: now.getDate(), m: now.getMonth() + 1, y: now.getFullYear() }

  const [day, setDay] = useState(initial.d)
  const [month, setMonth] = useState(initial.m)
  const [year, setYear] = useState(initial.y)

  const years = Array.from({ length: 16 }, (_, i) => now.getFullYear() - 12 + i)
  const yearOptions = years.map(y => ({ value: y, label: String(y) }))

  const handleDone = () => {
    const clampedDay = Math.min(day, daysInMonth(year, month))
    const pad = (n: number) => String(n).padStart(2, '0')
    onDone(`${year}-${pad(month)}-${pad(clampedDay)}`)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-[70] bg-white rounded-t-2xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-chrome-100 px-4 py-3">
          <button onClick={onClose} className="text-chrome-500 text-[13.5px]">Cancel</button>
          <span className="font-semibold text-chrome-900 text-[14px]">{label}</span>
          <button onClick={handleDone} className="text-ssi-600 font-semibold text-[13.5px]">Done</button>
        </div>
        <div className="relative flex px-4" style={{ height: WHEEL_H }}>
          <div
            className="absolute left-4 right-4 pointer-events-none border-y border-chrome-200"
            style={{ top: ITEM_H * PAD_ROWS, height: ITEM_H }}
          />
          <WheelColumn options={DAY_OPTIONS} value={day} onSettle={setDay} />
          <WheelColumn options={MONTH_OPTIONS} value={month} onSettle={setMonth} />
          <WheelColumn options={yearOptions} value={year} onSettle={setYear} />
        </div>
        {value ? (
          <button
            onClick={() => onDone(null)}
            className="border-t border-chrome-100 text-center py-2.5 text-molten-600 text-[13px]"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.625rem)' }}
          >
            Clear date
          </button>
        ) : (
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
        )}
      </div>
    </>
  )
}

interface Props {
  value: string // 'YYYY-MM-DD' or ''
  onChange: (v: string | null) => void
  disabled?: boolean
  label: string
}

export function MobileDateWheelPicker({ value, onChange, disabled, label }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-2 bg-white border border-chrome-200 rounded-lg px-3 py-3 text-[15px] text-left disabled:bg-chrome-50"
      >
        <span className={value ? 'text-chrome-900' : 'text-chrome-400'}>{value ? formatDisplay(value) : 'Select date'}</span>
        <CalendarDays size={16} className="text-chrome-400 flex-shrink-0" />
      </button>

      {open && (
        <MobileDateWheelSheet
          label={label}
          value={value}
          onDone={v => { onChange(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
