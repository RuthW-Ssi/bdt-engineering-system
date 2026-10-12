import type { WoEvent } from '../api/wo'
import { isProgressNoise, PROGRESS_FIELD_LABEL } from '../components/wo/progressChanges'
import { historyView, type MarkGroup } from './moHistory'

// WO Events as History (2026-10-09, user: "events ของ wo … เปลี่ยนเป็น history …
// theme เดียวกัน"): the same card view as MO History — type, title, changes
// grouped by mark (old → new). Edits written as "<title>: item · item" reuse the
// MO History parser, so a WO following an MO change reads exactly like the MO.

export type WoHistoryKind = 'status' | 'create' | 'progress' | 'mo' | 'edit' | 'mark'
export interface WoHistoryView { kind: WoHistoryKind; title: string; groups: MarkGroup[]; lines: string[]; warnings: string[] }

const STATUS_TITLE: Record<string, string> = {
  START: 'เริ่มงาน', PAUSE: 'พักงาน', RESUME: 'ทำงานต่อ', DONE: 'เสร็จงาน', CANCEL: 'ยกเลิก WO',
  HOLD: 'พักไว้ (Hold)', UNHOLD: 'ปลด Hold', ACCEPT_VERSION: 'รับ BOM version ใหม่',
}

const show = (v: number | null) => (v == null ? '—' : String(v))

export function woHistoryView(e: WoEvent, marks: { id: number; mark: string }[]): WoHistoryView {
  const markOf = e.work_order_mark_id != null ? marks.find(m => m.id === e.work_order_mark_id)?.mark : undefined
  const notes = e.notes?.trim() ?? ''

  if (e.event_type === 'PROGRESS_UPDATE') {
    const values = (e.changes ?? []).filter(c => !isProgressNoise(c)).map(c => ({ field: PROGRESS_FIELD_LABEL[c.field] ?? c.field, from: show(c.old), to: show(c.new) }))
    return { kind: 'progress', title: 'อัปเดตความคืบหน้า', groups: values.length ? [{ mark: markOf ?? 'mark', isNew: false, values, parts: [] }] : [], lines: notes ? [notes] : [], warnings: [] }
  }
  if (e.event_type === 'CREATED') return { kind: 'create', title: notes || 'สร้าง WO', groups: [], lines: [], warnings: [] }
  if (e.event_type === 'MARK_REMOVED') {
    return { kind: 'mark', title: `เอา mark ${markOf ?? ''} ออกจาก WO`.replace('  ', ' '), groups: [], lines: notes ? [notes] : [], warnings: [] }
  }
  if (e.event_type === 'EDIT') {
    const v = historyView({ from_status: 'X', to_status: 'X', reason: notes })
    // follows the MO: "อัปเดตตามการแก้ที่ MO: …" / "<mark> ย้ายไป BOM version ใหม่ … ตามการเทียบที่ MO: …"
    const followsMo = /ที่ MO/.test(v.title)
    // a line the parser couldn't tie to a value leaves an empty mark box behind — drop those
    return { kind: followsMo ? 'mo' : 'edit', title: v.title, groups: v.groups.filter(g => g.values.length || g.parts.length), lines: v.lines, warnings: v.warnings }
  }
  const title = STATUS_TITLE[e.event_type] ?? e.event_type
  return { kind: 'status', title: markOf ? `${title} · ${markOf}` : title, groups: [], lines: notes ? [notes] : [], warnings: [] }
}
