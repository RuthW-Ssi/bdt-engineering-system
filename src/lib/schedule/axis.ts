import { DAY, HOUR, LONG_FMT, bkkDay, eachDay, fmt, isWorkDay, winMs } from './time'

// Gantt time axis (port of prod-scheduler.html workWindows / buildSeg / X /
// invX / dayGroups + the axis range in render()). Working windows are drawn at
// `pxh` px per hour; the gaps between them collapse to thin "off-shift" bands.

/** Calendar blocks in minutes of the Bangkok day: เช้า 08–12 · บ่าย 13–17:30 · โอที 18–22. */
export const SHIFTS: ReadonlyArray<readonly [number, number]> = [
  [480, 720],
  [780, 1050],
  [1080, 1320],
]

/** Zoom = px per working hour. */
export const ZOOM = { initial: 22, min: 10, max: 60, step: 6 } as const
export const zoomIn = (pxh: number): number => Math.min(ZOOM.max, pxh + ZOOM.step)
export const zoomOut = (pxh: number): number => Math.max(ZOOM.min, pxh - ZOOM.step)

/** Off-shift band widths (px): lunch/dinner, overnight, over a Sunday/holiday. */
export const OFF_BAND_PX = { short: 4, night: 16, dayOff: 30 } as const

/** 'w' = working window, 'o' = off-shift gap; [s,e) in ms ↔ [x0,x1) in px. */
export interface Seg {
  t: 'w' | 'o'
  s: number
  e: number
  x0: number
  x1: number
}

export interface Axis {
  seg: Seg[]
  totalW: number
  pxh: number
}

export interface TimeWindow {
  s: number
  e: number
}

/** Shift windows of every working day that touch [t0, t1], in time order. */
export function workWindows(t0: number, t1: number, holidays: ReadonlySet<string>): TimeWindow[] {
  const out: TimeWindow[] = []
  for (const day of eachDay(bkkDay(t0), bkkDay(t1))) {
    if (!isWorkDay(day, holidays)) continue
    for (const [s, e] of SHIFTS) out.push({ s: winMs(day, s), e: winMs(day, e) })
  }
  return out.filter((w) => w.e >= t0 && w.s <= t1).sort((a, b) => a.s - b.s)
}

/** Lay the windows of [t0, t1] out on x; off bands are thin for lunch/dinner, wider overnight, widest over a day off. */
export function buildSeg(t0: number, t1: number, holidays: ReadonlySet<string>, pxh: number): Axis {
  const seg: Seg[] = []
  const W = workWindows(t0, t1, holidays)
  let cx = 0
  for (let i = 0; i < W.length; i++) {
    const w = W[i]
    const wpx = ((w.e - w.s) / HOUR) * pxh
    seg.push({ t: 'w', s: w.s, e: w.e, x0: cx, x1: cx + wpx })
    cx += wpx
    if (i < W.length - 1) {
      const gap = (W[i + 1].s - w.e) / HOUR
      const opx = gap > 24 ? OFF_BAND_PX.dayOff : gap > 6 ? OFF_BAND_PX.night : OFF_BAND_PX.short
      seg.push({ t: 'o', s: w.e, e: W[i + 1].s, x0: cx, x1: cx + opx })
      cx += opx
    }
  }
  return { seg, totalW: cx, pxh }
}

/** What axisRange() needs of an op. */
export interface AxisOp {
  s: number
  e: number
  moDue: number | null
}

/**
 * Axis span: whole Bangkok days, at least 7 working days (like the mockup),
 * stretched to MO due dates that fall within ±14 days of the ops. No ops →
 * a 7-working-day window from `now`. `s0` = first op start (auto-scroll target).
 */
export function axisRange(ops: readonly AxisOp[], holidays: ReadonlySet<string>, now: number = Date.now()): { t0: number; t1: number; s0: number } {
  let s0 = now
  let e0 = now
  if (ops.length) {
    s0 = Infinity
    e0 = -Infinity
    for (const o of ops) {
      if (o.s < s0) s0 = o.s
      if (o.e > e0) e0 = o.e
    }
  }
  let lo = s0
  let hi = e0
  for (const o of ops) {
    const d = o.moDue
    if (d != null && d > s0 - 14 * DAY && d < e0 + 14 * DAY) {
      if (d < lo) lo = d
      if (d > hi) hi = d
    }
  }
  const t0 = winMs(bkkDay(lo), 0)
  let t1 = Math.max(winMs(bkkDay(hi), 1440), t0 + 7 * DAY)
  for (let g = 0; g < 400 && eachDay(bkkDay(t0), bkkDay(t1 - 1)).filter((d) => isWorkDay(d, holidays)).length < 7; g++) t1 += DAY
  return { t0, t1, s0 }
}

/** axisRange + buildSeg in one go. */
export function buildAxis(ops: readonly AxisOp[], holidays: ReadonlySet<string>, pxh: number, now: number = Date.now()): Axis & { s0: number } {
  const { t0, t1, s0 } = axisRange(ops, holidays, now)
  return { ...buildSeg(t0, t1, holidays, pxh), s0 }
}

/** Time → px (clamped to [0, totalW]). */
export function X(axis: Axis, ms: number): number {
  const { seg } = axis
  if (!seg.length || ms <= seg[0].s) return 0
  for (const g of seg) {
    if (ms >= g.s && ms < g.e) {
      return g.t === 'w' ? g.x0 + ((ms - g.s) / HOUR) * axis.pxh : g.x0 + ((ms - g.s) / (g.e - g.s)) * (g.x1 - g.x0)
    }
  }
  return axis.totalW
}

/** px → time (inverse of X inside the axis; the axis end past it). */
export function invX(axis: Axis, px: number): number {
  for (const g of axis.seg) {
    if (px >= g.x0 && px < g.x1) {
      return g.t === 'w' ? g.s + ((px - g.x0) / axis.pxh) * HOUR : g.s + ((px - g.x0) / (g.x1 - g.x0)) * (g.e - g.s)
    }
  }
  return axis.seg.at(-1)?.e ?? 0
}

export function segAt(axis: Axis, px: number): Seg | null {
  return axis.seg.find((g) => px >= g.x0 && px < g.x1) ?? null
}

/** Working days on the axis with their px span (header cells, heatmap / load-card columns). */
export function dayGroups(axis: Axis): Array<{ day: string; x0: number; x1: number }> {
  const m = new Map<string, { day: string; x0: number; x1: number }>()
  for (const g of axis.seg) {
    if (g.t !== 'w') continue
    const day = bkkDay(g.s)
    const cur = m.get(day)
    if (!cur) m.set(day, { day, x0: g.x0, x1: g.x1 })
    else cur.x1 = g.x1
  }
  return [...m.values()]
}

/** Hover time cursor at `px` (relative to the timeline body): hidden past the axis end. */
export function cursorAt(axis: Axis, px: number): { visible: boolean; label: string } {
  if (px > axis.totalW) return { visible: false, label: '' }
  const g = segAt(axis, px)
  return { visible: true, label: fmt(invX(axis, px), LONG_FMT) + (g?.t === 'o' ? ' · นอกเวลา' : '') }
}

/** First draw of a version → scroll so the first op sits 40 px in. */
export function initialScrollLeft(axis: Axis & { s0: number }, opCount: number): number {
  return opCount ? Math.max(0, X(axis, axis.s0) - 40) : 0
}
