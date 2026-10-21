import type { WoProgressChange } from '../../api/wo'

// Display labels for work_order_event.changes fields (2026-10-05) — the Marks
// table's own column headers. Used by the WO Events tab (the mark's own
// history in the edit panel renders a column-aligned table instead).
export const PROGRESS_FIELD_LABEL: Record<string, string> = {
  qty_planned: 'Quantity',
  qty_not_started: 'Not Started',
  qty_in_progress: 'In Progress',
  qty_done: 'Done',
  qty_qc_passed: 'QC Passed',
  qty_rework: 'Rework',
  qty_renew: 'Renew',
  actual_finish: 'Finish Date',
  assembly_mark: 'Mark', // renamed in the BOM, taken at accept (2026-10-21)
}

/** dd/mm/yyyy HH:MM in the browser's local time — the mark finish date (2026-10-14). */
export function fmtFinish(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** One side of a change: '—' when empty, a date for actual_finish, else the number. */
export function showChangeValue(field: string, v: number | string | null): string {
  if (v == null) return '—'
  return field === 'actual_finish' ? fmtFinish(String(v)) : String(v)
}

/** Blank and 0 mean the same to every progress rule — entries logged before
 *  the backend stopped recording blank→0 would otherwise read "Done — → 0". */
export function isProgressNoise(c: WoProgressChange): boolean {
  return c.field !== 'qty_planned' && (c.old ?? 0) === (c.new ?? 0)
}

/** 'Done 5 → 8, QC Passed 4 → 6' — '' for null/empty, '—' for a null value,
 *  blank→0 noise dropped. */
export function formatProgressChanges(changes: WoProgressChange[] | null | undefined): string {
  return (changes ?? [])
    .filter(c => !isProgressNoise(c))
    .map(c => `${PROGRESS_FIELD_LABEL[c.field] ?? c.field} ${showChangeValue(c.field, c.old)} → ${showChangeValue(c.field, c.new)}`)
    .join(', ')
}
