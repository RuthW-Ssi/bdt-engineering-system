// Per-mark BOM rev helpers (2026-10-26, wiki features/bom-mark-revision-plan.md).

import type { MarkDiffDto, RevReviewRowDto, RevSource } from '../../api/dispatches'

export type RevMove = { from: number; to: number }

/** "Rev 1 → 2", or "Rev 1 → 2 · ข้อมูล BOM ไม่เปลี่ยน" when only the rev moved. */
export function revMoveText(rev: RevMove | null, dataSame: boolean): string | null {
  if (!rev) return null
  return `Rev ${rev.from} → ${rev.to}${dataSame ? ' · ข้อมูล BOM ไม่เปลี่ยน' : ''}`
}

/** The REV_UP move out of a WO bom-version status, if any. */
export function revUpOf(bom: { delta_types: string[]; delta_details: Record<string, unknown> | null } | null | undefined): RevMove | null {
  const r = (bom?.delta_details as { rev?: RevMove } | null)?.rev
  return bom?.delta_types.includes('REV_UP') && r ? { from: r.from, to: r.to } : null
}

export const MARK_FIELD_LABEL: Record<string, string> = { qty: 'ชุด', name: 'Name', length_mm: 'L', width_mm: 'W', height_mm: 'H', weight_kg: 'kg/ชุด', surface_area_m2: 'area/ชุด' }
export const PART_FIELD_LABEL: Record<string, string> = { qty: 'จำนวน/ชุด', description: 'Description', profile: 'Profile', grade: 'Grade', length_mm: 'L', weight_kg: 'kg/ชิ้น' }
export const REV_SOURCE_LABEL: Record<RevSource, string> = { DISPATCH_NOTE: 'rev จาก Dispatch Note', CARRIED: 'rev เดิม', NEW: 'mark ใหม่', MANUAL: 'กำหนด rev เอง' }
export const showValue = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : String(v))

/** One plain line per change: "L 650 → 700", "เพิ่ม part p2", "part p1: Profile A → B". */
export function diffLines(d: MarkDiffDto | null): string[] {
  if (!d) return []
  return [
    ...d.fields.map(c => `${MARK_FIELD_LABEL[c.field] ?? c.field} ${showValue(c.old)} → ${showValue(c.new)}`),
    ...d.parts_added.map(p => `เพิ่ม part ${p.part_mark}`),
    ...d.parts_removed.map(p => `ลบ part ${p.part_mark}`),
    ...d.parts_changed.map(p => `part ${p.part_mark}: ${p.changes.map(c => `${PART_FIELD_LABEL[c.field] ?? c.field} ${showValue(c.old)} → ${showValue(c.new)}`).join(', ')}`),
  ]
}

/** The review table's "ผล" cell. */
export function rowResult(r: RevReviewRowDto, hasDn: boolean): string {
  if (r.warning === 'CHANGED_NO_REV_UP') {
    if (r.in_dn) return '⚠ ข้อมูลเปลี่ยน แต่ Dispatch Note ไม่ได้ขึ้น rev — ตรวจ rev ใหม่'
    return hasDn ? '⚠ ข้อมูลเปลี่ยน แต่ไม่มีใน Dispatch Note — ตรวจ rev ใหม่' : '⚠ ข้อมูลเปลี่ยน — ตรวจ rev ใหม่'
  }
  if (r.warning === 'REV_UP_NO_CHANGE') return '⚠ rev ขึ้นแต่ข้อมูลไม่เปลี่ยน'
  if (r.warning === 'DN_REV_LOWER') return `⚠ Dispatch Note บอก rev ${r.dn_rev} ต่ำกว่า rev ปัจจุบัน`
  if (r.kind === 'added') return 'mark ใหม่'
  if (r.kind === 'removed') return 'ถูกลบออกจาก BOM'
  return r.kind === 'changed' ? 'ข้อมูลเปลี่ยน' : 'ไม่เปลี่ยน'
}

/** Same rules as the server (backend mark-rev.ts finalizeRevs). */
export function revError(r: RevReviewRowDto, text: string): string | null {
  const t = text.trim()
  if (!/^\d+$/.test(t)) return 'ใส่เลข rev'
  const n = Number(t)
  if (n > 999) return 'rev สูงสุด 999'
  if (r.prev_rev != null && n < r.prev_rev) return `ต่ำกว่า Rev เดิม (${r.prev_rev}) ไม่ได้`
  // changed data must raise the rev (WO alerts only on a rev rise)
  if (r.kind === 'changed' && r.prev_rev != null && n <= r.prev_rev) return `ข้อมูลของ mark นี้เปลี่ยน ต้องใส่ rev มากกว่า ${r.prev_rev}`
  return null
}
