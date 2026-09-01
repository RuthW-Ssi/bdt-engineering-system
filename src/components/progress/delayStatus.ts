// Pace-based delay detection for a zone's erection schedule — compares
// elapsed time within [target_erection_start, target_erection_end] against
// actual erect_pct, rather than just flagging "overdue" once the deadline
// has already passed (that alone can't warn you *before* it's too late).
// Pure, framework-agnostic — shared by desktop (ProjectProgress.tsx) and
// mobile (MobileZoneList.tsx/MobileAssemblyList.tsx) so both compute
// identical results from one implementation. Mirrors the shared-module
// precedent already set by statusMeta.ts in this same folder.
export type DelayStatus = 'overdue' | 'at_risk' | 'on_track'
// How far behind the time-elapsed pace (in percentage points) before a
// still-in-window zone counts as "at risk" rather than "on track" — a small
// gap is normal slack, not a real signal.
export const DELAY_MARGIN_PCT = 15
export const DELAY_STATUS_COLOR: Record<DelayStatus, string> = {
  overdue: '#C8202A',
  at_risk: '#E67700',
  on_track: '#2E9E5F',
}
const MS_PER_DAY = 86400000

export interface DelayInfo {
  status: DelayStatus
  actualPct: number
  // null when there's no meaningful in-window comparison to show (already
  // complete, or the window hasn't opened yet) — vs. a real 0-100 expected
  // value once the zone is inside its erection window.
  expectedPct: number | null
  // Raw day counts behind expectedPct, kept alongside it so the tooltip can
  // show the actual `elapsed ÷ total × 100` formula, not just its result —
  // for 'overdue', elapsedDays instead holds days *past* the deadline.
  elapsedDays: number | null
  totalDays: number | null
}

export function computeDelayInfo(startIso: string | null | undefined, endIso: string | null | undefined, erectPct: number): DelayInfo | null {
  if (!startIso || !endIso) return null // no schedule set — nothing to evaluate against
  if (erectPct >= 100) return { status: 'on_track', actualPct: erectPct, expectedPct: null, elapsedDays: null, totalDays: null }
  const today = new Date()
  const start = new Date(startIso)
  const end = new Date(endIso)
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  if (today > end) {
    const daysPastDue = Math.round((today.getTime() - end.getTime()) / MS_PER_DAY)
    return { status: 'overdue', actualPct: erectPct, expectedPct: 100, elapsedDays: daysPastDue, totalDays }
  }
  if (today < start) return { status: 'on_track', actualPct: erectPct, expectedPct: null, elapsedDays: null, totalDays } // window hasn't opened yet — not due
  const elapsedDays = Math.round((today.getTime() - start.getTime()) / MS_PER_DAY)
  const expectedPct = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 100
  const status: DelayStatus = erectPct < expectedPct - DELAY_MARGIN_PCT ? 'at_risk' : 'on_track'
  return { status, actualPct: erectPct, expectedPct, elapsedDays, totalDays }
}

// Spells out the actual numbers behind the color so the status is
// verifiable at a glance instead of a colored dot you just trust. Split
// into a label (colored by status) + the rest of the sentence, rather than
// a plain string, so the render site can highlight the status word.
export function delayTooltipParts(info: DelayInfo): { label: string; rest: string } {
  const actual = `${info.actualPct.toFixed(0)}%`
  if (info.status === 'overdue') {
    const daysPast = info.elapsedDays !== null ? ` (${info.elapsedDays}d past due)` : ''
    return { label: 'Overdue', rest: `— target end date has passed${daysPast}. Actual erection: ${actual}.` }
  }
  if (info.expectedPct === null) {
    return info.actualPct >= 100
      ? { label: 'Complete', rest: '— 100% erected.' }
      : { label: 'Not due yet', rest: `— erection window hasn't started. Actual erection: ${actual}.` }
  }
  const expected = `${info.expectedPct.toFixed(0)}%`
  const gap = (info.expectedPct - info.actualPct).toFixed(0)
  const formula = info.elapsedDays !== null && info.totalDays !== null
    ? ` [${info.elapsedDays}d ÷ ${info.totalDays}d × 100 ≈ ${expected}]`
    : ''
  return info.status === 'at_risk'
    ? { label: 'At risk', rest: `— expected ~${expected} erected by now${formula}, actual is ${actual} (${gap}pts behind, over the ${DELAY_MARGIN_PCT}pt margin).` }
    : { label: 'On track', rest: `— expected ~${expected} erected by now${formula}, actual is ${actual}.` }
}
