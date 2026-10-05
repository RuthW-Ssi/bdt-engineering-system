// Audit helper for WO per-mark quantities (2026-10-05, wiki
// features/wo-progress-history-plan.md): which qty fields a write changes,
// as the `changes` JSON stored on work_order_event.
export const EDITABLE_PROGRESS_FIELDS = [
  'qty_not_started', 'qty_in_progress', 'qty_done', 'qty_qc_passed', 'qty_rework', 'qty_renew',
] as const
export type EditableProgressField = (typeof EDITABLE_PROGRESS_FIELDS)[number]
export type ProgressField = 'qty_planned' | EditableProgressField
const ORDER: ProgressField[] = ['qty_planned', ...EDITABLE_PROGRESS_FIELDS]

/** The Marks table's own column headers — used in user-facing 400 messages. */
export const FIELD_LABEL: Record<ProgressField, string> = {
  qty_planned: 'Quantity',
  qty_not_started: 'Not Started',
  qty_in_progress: 'In Progress',
  qty_done: 'Done',
  qty_qc_passed: 'QC Passed',
  qty_rework: 'Rework',
  qty_renew: 'Renew',
}

export interface ProgressChange { field: ProgressField; old: number | null; new: number | null }

export function toNum(v: { toString(): string } | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v.toString())
  return Number.isFinite(n) ? n : null
}

/**
 * For the six editable fields a blank (null) and 0 mean the same to every rule,
 * so null ↔ 0 is NOT a change (no "In Progress — → 0" noise on a first save).
 * qty_planned keeps strict comparison. Start's seed (null → planned) is logged.
 */
export function diffProgress(
  before: Partial<Record<ProgressField, unknown>>,
  after: Partial<Record<ProgressField, unknown>>,
): ProgressChange[] {
  const changes: ProgressChange[] = []
  for (const field of ORDER) {
    if (!(field in after) || after[field] === undefined) continue
    const oldV = toNum(before[field] as never)
    const newV = toNum(after[field] as never)
    const same = field === 'qty_planned' ? oldV === newV : (oldV ?? 0) === (newV ?? 0)
    if (!same) changes.push({ field, old: oldV, new: newV })
  }
  return changes
}
