// Bangkok date helpers for the Production Schedule page (port of
// the retired HTML cockpit (git history: backend-schedule/cockpit/prod-scheduler.html)). Asia/Bangkok is a fixed
// UTC+7 with no DST, so day / minute-of-day maths use the offset directly
// (hot path: ivBuckets / X run per op on every render — same approach as
// backend ScheduleService's BANGKOK_OFFSET_MS); labels go through Intl with
// timeZone 'Asia/Bangkok'.

export const TZ = 'Asia/Bangkok'
export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000
const BKK_OFFSET = 7 * HOUR

export const pad = (n: number): string => String(n).padStart(2, '0')

/** ISO string → epoch ms; null for null / unparsable. */
export function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/** 'YYYY-MM-DD' of the instant in Bangkok. */
export function bkkDay(ms: number): string {
  return new Date(ms + BKK_OFFSET).toISOString().slice(0, 10)
}

/** Minute of the Bangkok day, 0..1439 (seconds truncated, like an HH:mm formatter). */
export function bkkMin(ms: number): number {
  const m = Math.floor((ms + BKK_OFFSET) / MINUTE) % 1440
  return m < 0 ? m + 1440 : m
}

/** Epoch ms of `mins` minutes after Bangkok midnight of `day` (mins may be 1440 = next midnight). */
export function winMs(day: string, mins: number): number {
  return Date.parse(`${day}T00:00:00Z`) - BKK_OFFSET + mins * MINUTE
}

/** Every 'YYYY-MM-DD' from d0 to d1 inclusive (guarded at 400 days). */
export function eachDay(d0: string, d1: string): string[] {
  const out: string[] = []
  const d = new Date(`${d0}T00:00:00Z`)
  const end = new Date(`${d1}T00:00:00Z`)
  for (let g = 0; d <= end && g < 400; g++) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Working day = not a Sunday and not a calendar_exception holiday. */
export function isWorkDay(day: string, holidays: ReadonlySet<string>): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() !== 0 && !holidays.has(day)
}

// ── labels (th-TH) ────────────────────────────────────────────────────────────
// Building a DateTimeFormat is costly — reuse one per option set.
const FMT_CACHE = new Map<string, Intl.DateTimeFormat>()
function formatter(opts: Intl.DateTimeFormatOptions, timeZone: string): Intl.DateTimeFormat {
  const key = timeZone + JSON.stringify(opts)
  let f = FMT_CACHE.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('th-TH', { timeZone, ...opts })
    FMT_CACHE.set(key, f)
  }
  return f
}

const DEFAULT_FMT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
export const LONG_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
export const DAY_MONTH_FMT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }

/** e.g. "02 ต.ค. 20:45" (Bangkok). */
export function fmt(ms: number, opts: Intl.DateTimeFormatOptions = DEFAULT_FMT): string {
  return formatter(opts, TZ).format(ms)
}

/** "HH:mm" (Bangkok). */
export function fmtH(ms: number): string {
  return formatter({ hour: '2-digit', minute: '2-digit' }, TZ).format(ms)
}

/** Short weekday + day of a 'YYYY-MM-DD' (heatmap / load-card column label). */
export function dShort(day: string): string {
  return formatter({ weekday: 'short', day: '2-digit' }, 'UTC').format(Date.parse(`${day}T00:00:00Z`))
}

/** Gantt day-header parts of a 'YYYY-MM-DD': bold weekday + "dd MMM". */
export function dayHead(day: string): { weekday: string; date: string } {
  const ms = Date.parse(`${day}T00:00:00Z`)
  return {
    weekday: formatter({ weekday: 'short' }, 'UTC').format(ms),
    date: formatter(DAY_MONTH_FMT, 'UTC').format(ms),
  }
}
