import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { DISPATCH_RULES, type DispatchRule, type ScheduleRunResult } from '../../api/schedule'
import { useRunSchedule } from '../../hooks/useSchedule'
import { describeScheduleError } from '../../lib/schedule'
import { BTN, BTN_ACCENT, ERROR_BOX } from './styles'

// The page offers the two scheduler modes the plant uses; the API also takes
// 'forward' / 'alap' (aliases), kept out of the form on purpose.
const DIRECTIONS = [
  { value: 'event', label: 'Event-based (forward)' },
  { value: 'backward', label: 'Backward (ALAP)' },
] as const
type FormDirection = (typeof DIRECTIONS)[number]['value']

/**
 * ▶ Run scheduler — small drop-down form (direction · dispatch rule · activate)
 * → POST /schedule/runs. 409 / 422 (+ reasons) / other errors render inside
 * the form. Render only for users with orders:update.
 */
export function RunSchedulePanel({ onRan }: { onRan: (result: ScheduleRunResult) => void }) {
  const run = useRunSchedule()
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<FormDirection>('event')
  const [rule, setRule] = useState<DispatchRule>('EDD')
  const [activate, setActivate] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)

  const err = run.error ? describeScheduleError(run.error, 'Scheduler run failed') : null

  // Closing the form hands focus back to the toggle — once it is enabled again.
  useEffect(() => {
    if (!refocus.current || open || run.isPending) return
    refocus.current = false
    toggleRef.current?.focus()
  }, [open, run.isPending])

  // Closing is blocked while a run is in flight: reset() would detach the
  // observer and drop its result (toast, version switch, 409/422/5xx).
  const toggle = () => {
    if (run.isPending) return
    if (open) {
      run.reset()
      refocus.current = true
    }
    setOpen(!open)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run.mutate(
      { direction, dispatch_rule: rule, activate },
      {
        onSuccess: (res) => {
          toast.success(`คำนวณเสร็จ · ${res.version_code ?? 'ไม่มี version'}${res.is_active ? ' (active)' : ''}`)
          refocus.current = true
          setOpen(false)
          onRan(res)
        },
      },
    )
  }

  return (
    <div className="relative">
      <button ref={toggleRef} type="button" onClick={toggle} disabled={run.isPending} aria-expanded={open} className={BTN_ACCENT}>
        <Play size={12} />
        Run scheduler
      </button>
      {open && (
        <form
          aria-label="Run scheduler"
          onSubmit={submit}
          className="absolute right-0 top-full mt-2 z-30 w-[300px] bg-white border border-[#d8dde3] rounded-[10px] p-3 text-xs text-[#1f2733] shadow-[0_8px_24px_rgba(20,26,33,.22)] flex flex-col gap-2.5"
        >
          <label className="flex items-center gap-2">
            <span className="w-16 text-[#6b7682]">Direction</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as FormDirection)}
              className="flex-1 min-w-0 border border-[#d8dde3] rounded-md px-2 py-1 bg-white"
            >
              {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16 text-[#6b7682]">Rule</span>
            <select
              value={rule}
              onChange={(e) => setRule(e.target.value as DispatchRule)}
              className="flex-1 min-w-0 border border-[#d8dde3] rounded-md px-2 py-1 bg-white"
            >
              {DISPATCH_RULES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
            <span>activate — ตั้งเป็น version ที่ใช้งานทันที</span>
          </label>

          {err && (
            <div role="alert" className={ERROR_BOX}>
              <div className="font-semibold">{err.message}</div>
              {err.reasons.length > 0 && (
                <ul className={`mt-1 mb-0 pl-4 list-disc ${err.reasons.length > 6 ? 'max-h-[150px] overflow-y-auto' : ''}`}>
                  {err.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={toggle} disabled={run.isPending} className={BTN}>ยกเลิก</button>
            <button type="submit" disabled={run.isPending} className={BTN_ACCENT}>
              {run.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {run.isPending ? 'กำลังคำนวณ…' : 'Run'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
