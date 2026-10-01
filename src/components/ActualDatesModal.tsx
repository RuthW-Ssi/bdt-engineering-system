import { useId, useState } from 'react'
import { Pencil } from 'lucide-react'
import { datetimeLocalToIso, toDatetimeLocal } from '../lib/datetimeLocal'

type Timeliness = 'ON_PLAN' | 'DELAYED'

export interface ActualDatesValue {
  actual_start: string
  actual_finish: string
  timeliness?: Timeliness
  delay_note?: string
  reason?: string
}

interface ActualDatesForm {
  start: string
  finish: string
  timeliness: '' | Timeliness
  delayNote: string
  reason: string
}

/**
 * Client-side mirror of the backend's actual-date rules (2026-10-01 — the
 * system never auto-fills actual_start/actual_finish, the user types them).
 * Backend stays authoritative (it allows 5 min clock skew; this checks the
 * browser clock with none). Exported (pure) for unit testing.
 */
export function validateActualDatesForm(
  form: ActualDatesForm,
  opts: { withTimeliness: boolean; withReason: boolean; now: Date },
): string[] {
  const errors: string[] = []
  if (!form.start) errors.push('Actual Start is required')
  if (!form.finish) errors.push('Actual Finish is required')
  const start = form.start ? new Date(form.start).getTime() : NaN
  const finish = form.finish ? new Date(form.finish).getTime() : NaN
  if (finish < start) errors.push('Actual Finish must not be before Actual Start')
  const now = opts.now.getTime()
  if (start > now || finish > now) errors.push('Actual dates must not be in the future')
  if (opts.withTimeliness) {
    if (!form.timeliness) errors.push('Select On Plan or Delayed')
    else if (form.timeliness === 'DELAYED' && !form.delayNote.trim()) errors.push('Delay reason is required')
  }
  if (opts.withReason && !form.reason.trim()) errors.push('A reason is required')
  return errors
}

function fmtDateTime(d: string | null) {
  return d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

const LABEL = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#999', margin: '14px 0 6px', display: 'block' }
const DATE_INPUT = { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #DDD', borderRadius: 6, boxSizing: 'border-box' as const }
const TEXTAREA = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' as const }
const Req = () => <span style={{ color: '#C8202A' }}>*</span>

// Shared by MO + WO detail pages (2026-10-01): Complete (MO adds the status
// reason, WO adds On Plan / Delayed) and the DONE-only "edit actual dates".
// Fields start EMPTY unless `initial` is given — never prefilled with now or
// the plan dates, the user must type what actually happened.
export function ActualDatesModal({
  title, subtitle, plan, initial, withTimeliness = false, withReason = false, pending = false, error, onConfirm, onClose,
}: {
  title: string
  subtitle?: string
  plan?: { start: string | null; finish: string | null }
  initial?: { actual_start?: string | null; actual_finish?: string | null; timeliness?: Timeliness | null; delay_note?: string | null }
  withTimeliness?: boolean
  withReason?: boolean
  pending?: boolean
  error?: string | null
  onConfirm: (v: ActualDatesValue) => void
  onClose: () => void
}) {
  const id = useId()
  const [form, setForm] = useState<ActualDatesForm>(() => ({
    start: toDatetimeLocal(initial?.actual_start),
    finish: toDatetimeLocal(initial?.actual_finish),
    timeliness: initial?.timeliness ?? '',
    delayNote: initial?.delay_note ?? '',
    reason: '',
  }))
  // Don't nag on first open — messages show once the user has touched a field.
  const [touched, setTouched] = useState(false)
  const now = new Date()
  const errors = validateActualDatesForm(form, { withTimeliness, withReason, now })
  const valid = errors.length === 0
  const maxNow = toDatetimeLocal(now.toISOString())

  function set<K extends keyof ActualDatesForm>(key: K, value: ActualDatesForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setTouched(true)
  }

  // The input only holds minutes — an untouched field sends back the stored
  // value as-is, so editing just one field doesn't truncate the other's
  // seconds (and log it as changed).
  const toIso = (value: string, stored?: string | null) =>
    stored && value === toDatetimeLocal(stored) ? stored : datetimeLocalToIso(value)

  function confirm() {
    if (!valid || pending) return
    onConfirm({
      actual_start: toIso(form.start, initial?.actual_start),
      actual_finish: toIso(form.finish, initial?.actual_finish),
      ...(withTimeliness ? {
        timeliness: form.timeliness as Timeliness,
        delay_note: form.timeliness === 'DELAYED' ? form.delayNote.trim() : undefined,
      } : {}),
      ...(withReason ? { reason: form.reason.trim() } : {}),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div role="dialog" aria-label={title} style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{subtitle}</p>}
        {plan && (
          <p style={{ fontSize: 12, color: '#888' }}>Plan: {fmtDateTime(plan.start)} → {fmtDateTime(plan.finish)}</p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor={`${id}-start`} style={LABEL}>Actual Start <Req /></label>
            <input id={`${id}-start`} type="datetime-local" max={maxNow} value={form.start} onChange={e => set('start', e.target.value)} style={DATE_INPUT} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={`${id}-finish`} style={LABEL}>Actual Finish <Req /></label>
            <input id={`${id}-finish`} type="datetime-local" max={maxNow} value={form.finish} onChange={e => set('finish', e.target.value)} style={DATE_INPUT} />
          </div>
        </div>

        {withTimeliness && (
          <>
            <span style={LABEL}>Result <Req /></span>
            <div className="flex items-center gap-4" role="radiogroup" aria-label="Result">
              {([['ON_PLAN', 'On Plan'], ['DELAYED', 'Delayed']] as const).map(([value, label]) => (
                <label key={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio" name={`${id}-timeliness`} value={value} checked={form.timeliness === value}
                    onChange={() => set('timeliness', value)} style={{ accentColor: '#C8202A' }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {form.timeliness === 'DELAYED' && (
              <>
                <label htmlFor={`${id}-delay`} style={LABEL}>Delay Reason <Req /></label>
                <textarea id={`${id}-delay`} value={form.delayNote} onChange={e => set('delayNote', e.target.value)} rows={3} maxLength={1000} placeholder="Why was it delayed…" style={TEXTAREA} />
              </>
            )}
          </>
        )}

        {withReason && (
          <>
            <label htmlFor={`${id}-reason`} style={LABEL}>Reason <Req /></label>
            <textarea id={`${id}-reason`} value={form.reason} onChange={e => set('reason', e.target.value)} rows={3} placeholder="Reason…" style={TEXTAREA} />
          </>
        )}

        {touched && errors.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {errors.map(e => <div key={e} style={{ color: '#C8202A', fontSize: 12 }}>{e}</div>)}
          </div>
        )}
        {error && <div style={{ color: '#C8202A', fontSize: 12, marginTop: 10 }}>{error}</div>}

        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={confirm}
            disabled={!valid || pending}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: valid ? '#C8202A' : '#C2C2C2', color: '#fff', cursor: valid ? 'pointer' : 'not-allowed' }}
          >
            {pending ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Small pencil next to "Actual Start" on a DONE MO/WO's overview (2026-10-01).
export function EditActualDatesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick} title="Edit actual dates" aria-label="Edit actual dates"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 0, marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}
    >
      <Pencil size={13} />
    </button>
  )
}
