import { AUDITABLE_FIELDS } from '../projects/progress-change-log.service'

// What pairing copies (Project Progress + paint) and what it overwrote, so undo
// is exact (2026-10-21, spec open item 2: snapshot = yes).
export type Snapshot = Record<string, string | number | null>
export interface PaintSnap { paint_type: string; material_id: number | null; layers: number }
// `after` = exactly what pairing left the new mark's paint rows as (the old
// side's set, or empty if the old side had none) — compared against the
// CURRENT rows at undo time to detect an edit made after pairing (fix round
// 1, ruling 4).
export interface Carried { keep: 'old' | 'new'; progress?: { created: boolean; before: Snapshot | null }; paint?: { created_ids: number[]; before: PaintSnap[]; after: PaintSnap[] }; rev?: { before: number; before_source: string | null; after: number } }
export interface RenameDataSet { progress: { field: string; value: string | number }[]; paint: { paint_type: string; material: string | null; layers: number }[] }

const DATE_FIELDS = new Set(['fab_plan_finish_date', 'fab_actual_finish_date', 'plan_load_date', 'actual_load_date', 'erection_plan_finish_date', 'erection_actual_finish_date'])
/** A progress row nobody has touched (same defaults as the table). */
export const PROGRESS_DEFAULTS: Record<string, unknown> = Object.fromEntries(
  AUDITABLE_FIELDS.map(f => [f, f === 'payment_status' ? 'Not Disbursed' : DATE_FIELDS.has(f) ? null : 0]),
)
const isDefault = (f: string, v: unknown) => v == null || (f === 'payment_status' ? v === 'Not Disbursed' : !DATE_FIELDS.has(f) && Number(v) === 0)

export function snapshotProgress(row: Record<string, unknown>): Snapshot {
  const out: Snapshot = {}
  for (const f of AUDITABLE_FIELDS) {
    const v = row[f]
    out[f] = v == null ? null : v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : Number(v)
  }
  return out
}

export function restoreProgress(s: Snapshot): Record<string, unknown> {
  return Object.fromEntries(Object.entries(s).map(([f, v]) => [f, v != null && DATE_FIELDS.has(f) ? new Date(String(v)) : v]))
}

export function dataSetOf(progress: Record<string, unknown> | null, paint: { paint_type: string; layers: number; material: { name: string } | null }[]): RenameDataSet | null {
  const p = progress
    ? AUDITABLE_FIELDS.filter(f => f in progress && !isDefault(f, progress[f])).map(f => {
      const v = progress[f]
      return { field: f, value: v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v : Number(v) }
    })
    : []
  const paints = paint.map(x => ({ paint_type: x.paint_type, material: x.material?.name ?? null, layers: x.layers }))
  return p.length || paints.length ? { progress: p, paint: paints } : null
}

/** a1 (decision 5) + fix round 1 ruling 4: undo only while nothing has used
 *  the pair, and nothing was edited (Project Progress or paint) since. */
export function undoBlockReason(p: { used_at: Date | null; toActive: boolean; progressEditedAfter: boolean; paintEditedAfter: boolean; to_mark: string }): string | null {
  if (p.used_at) return `มี MO หรือ WO ใช้ชื่อ ${p.to_mark} ตามคู่นี้แล้ว — ยกเลิกคู่ไม่ได้`
  if (!p.toActive) return 'มี BOM version ใหม่กว่าแล้ว — ยกเลิกคู่ได้เฉพาะ version ล่าสุด'
  if (p.progressEditedAfter) return `มีคนกรอก Project Progress ของ ${p.to_mark} หลังจับคู่แล้ว — ยกเลิกคู่ไม่ได้`
  if (p.paintEditedAfter) return 'แก้ค่าสีของ mark นี้หลังจับคู่แล้ว — ยกเลิกคู่ไม่ได้'
  return null
}

/** Content equality for two paint-row sets, order independent (fix round 1,
 *  ruling 4) — used to detect a paint edit made after pairing. */
export function paintSetEqual(a: PaintSnap[], b: PaintSnap[]): boolean {
  const key = (p: PaintSnap) => `${p.paint_type}:${p.material_id ?? ''}:${p.layers}`
  const as = new Set(a.map(key))
  const bs = new Set(b.map(key))
  if (as.size !== a.length || bs.size !== b.length || as.size !== bs.size) return false
  for (const k of as) if (!bs.has(k)) return false
  return true
}

/** A rename pair never makes the BOM Rev go down (2026-10-26, fix round 1 —
 *  "No rev may go below the mark's current rev"): the new name takes
 *  max(old rev, new rev), whatever the new rev's source (NEW, Dispatch Note or
 *  typed). Undo puts `before` / `before_source` back exactly. */
export function revCarryOf(from?: { rev: number; rev_source: string | null }, to?: { rev: number; rev_source: string | null }) {
  if (!from || !to || !(from.rev > to.rev)) return null
  return { before: to.rev, before_source: to.rev_source, after: from.rev }
}
