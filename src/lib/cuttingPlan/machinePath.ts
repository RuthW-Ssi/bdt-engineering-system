import type { PlatePathElement, PlateViewPart, Pt } from '../../api/cutting-plan'

// Machine timeline of one plate (2026-11-06): the DXF RAPID / CUT elements in the order the cutter
// runs, timed with the report's Machine times (cut / rapid feed in mm/min, minutes per pierce).
// A pierce happens at the start of every cut that follows a rapid. On 222-B5-12-3 this gives
// 149.4 min, the same as the report.
export interface Machine { cutFeed: number; rapidFeed: number; pierceMin: number }
export const DEFAULT_MACHINE: Machine = { cutFeed: 2200, rapidFeed: 10000, pierceMin: 0.1 } // plasma figures of the sample plate

export interface PathStep { cut: boolean; pts: Pt[]; len: number; start: number; t0: number; dur: number; pierce: number }
export interface MachinePath { steps: PathStep[]; totalMm: number; totalMin: number; cutM: number; pierces: number }
export type HeadState = 'pierce' | 'cut' | 'rapid' | 'done'

export function buildMachinePath(path: PlatePathElement[], m: Machine = DEFAULT_MACHINE): MachinePath {
  let mm = 0, min = 0, cutMm = 0
  const steps = path.map(([t, f], j): PathStep => {
    const pts: Pt[] = []
    for (let i = 0; i + 1 < f.length; i += 2) pts.push([f[i], f[i + 1]])
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    const cut = t === 1
    const pierce = cut && (j === 0 || path[j - 1][0] === 0) ? m.pierceMin : 0
    const dur = pierce + len / (cut ? m.cutFeed : m.rapidFeed)
    const step = { cut, pts, len, start: mm, t0: min, dur, pierce }
    mm += len; min += dur; if (cut) cutMm += len
    return step
  })
  return { steps, totalMm: mm, totalMin: min, cutM: cutMm / 1000, pierces: steps.filter(s => !s.cut).length }
}

// Where the head is (mm travelled) and what it is doing at machine time t (minutes).
export function stateAt(mp: MachinePath, t: number): { mm: number; state: HeadState } {
  if (t >= mp.totalMin || !mp.steps.length) return { mm: mp.totalMm, state: 'done' }
  let lo = 0, hi = mp.steps.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (mp.steps[mid].t0 <= Math.max(0, t)) lo = mid; else hi = mid - 1 }
  const s = mp.steps[lo], r = Math.max(0, t) - s.t0
  if (r < s.pierce) return { mm: s.start, state: 'pierce' }
  const feed = s.cut ? (s.len / (s.dur - s.pierce || 1)) : (s.len / (s.dur || 1))
  return { mm: Math.min(s.start + s.len, s.start + (r - s.pierce) * feed), state: s.cut ? 'cut' : 'rapid' }
}

// The step the head is on after `mm` of travel, the point it has reached, pierces done and metres cut.
export function headAt(mp: MachinePath, mm: number): { step: number; pt: Pt; pierces: number; cutM: number } {
  const steps = mp.steps
  let i = 0
  while (i < steps.length - 1 && steps[i].start + steps[i].len < mm) i++
  const s = steps[i]
  let r = mm - s.start, pt = s.pts[s.pts.length - 1]
  for (let k = 1; k < s.pts.length; k++) {
    const a = s.pts[k - 1], b = s.pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (r <= L) { pt = L ? [a[0] + ((b[0] - a[0]) * r) / L, a[1] + ((b[1] - a[1]) * r) / L] : a; break }
    r -= L
  }
  let pierces = 0, cut = 0
  for (let j = 0; j <= i; j++) {
    if (!steps[j].cut && (j < i || mm >= steps[j].start + steps[j].len)) pierces++
    if (steps[j].cut) cut += Math.min(steps[j].len, Math.max(0, mm - steps[j].start))
  }
  return { step: i, pt, pierces, cutM: cut / 1000 }
}

// The points of step j up to `mm` of travel (whole step when the head is past it).
export function stepUpTo(s: PathStep, mm: number): Pt[] {
  if (mm >= s.start + s.len) return s.pts
  const out: Pt[] = [s.pts[0]]
  let r = mm - s.start
  for (let k = 1; k < s.pts.length; k++) {
    const a = s.pts[k - 1], b = s.pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (r <= L) { if (L) out.push([a[0] + ((b[0] - a[0]) * r) / L, a[1] + ((b[1] - a[1]) * r) / L]); break }
    out.push(b); r -= L
  }
  return out
}

// When each part is free: end time of the last cut lying inside the part's box (+6 mm for kerf).
// The smallest box wins, so a hole's cut belongs to the part around it, not to the sheet.
export function partFinishTimes(parts: PlateViewPart[], mp: MachinePath): number[] {
  const boxes = parts.map(p => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of p.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    return { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 6, a: (x1 - x0) * (y1 - y0) }
  })
  const done = parts.map(() => 0)
  for (const s of mp.steps) {
    if (!s.cut) continue
    let best = -1
    boxes.forEach((b, i) => {
      if (s.pts.every(([x, y]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) && (best < 0 || b.a < boxes[best].a)) best = i
    })
    if (best >= 0) done[best] = Math.max(done[best], s.t0 + s.dur)
  }
  return done
}

// The plate's machine time is what the report's Machine times table says: the simulation covers cutting and
// rapid moves only (no marking), so it may run short — on 309 of 3,719 legacy plates by 15 % at the median.
// The simulated total is shown only when it differs by more than 2 %.
export function plateTimeLabel(reportMin: number | null, simulatedMin: number): string {
  if (reportMin == null) return `${simulatedMin.toFixed(1)} min (simulated)`
  const differs = Math.abs(reportMin - simulatedMin) > 0.02 * reportMin
  return differs
    ? `${reportMin.toFixed(1)} min (report) · simulation ${simulatedMin.toFixed(1)} min, cutting and rapid only`
    : `${reportMin.toFixed(1)} min`
}
