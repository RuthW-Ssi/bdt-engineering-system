import { describe, expect, it } from 'vitest'
import { woHistoryView } from './woHistory'

// WO Events → History, same look as the MO's (2026-10-09, user: "เปลี่ยนเป็น history … theme เดียวกัน")
const ev = (event_type: string, extra: Record<string, unknown> = {}) =>
  ({ id: 1, work_order_id: 9, work_order_mark_id: null, event_type, notes: null, changes: null, recorded_by: 'tao', recorded_at: '2026-10-09T08:00:00Z', ...extra }) as never

describe('woHistoryView', () => {
  it('a status move: kind, Thai title, its reason as a line', () => {
    expect(woHistoryView(ev('CANCEL', { notes: 'แบบผิด' }), [])).toEqual({ kind: 'status', title: 'ยกเลิก WO', groups: [], lines: ['แบบผิด'], warnings: [] })
    expect(woHistoryView(ev('START'), []).title).toBe('เริ่มงาน')
  })

  it('progress: the mark with each quantity old → new, blank→0 noise dropped', () => {
    const v = woHistoryView(ev('PROGRESS_UPDATE', { work_order_mark_id: 5, changes: [{ field: 'qty_done', old: 1, new: 2 }, { field: 'qty_qc_passed', old: null, new: 2 }, { field: 'qty_rework', old: null, new: 0 }] }), [{ id: 5, mark: 'BUH1-3' }])
    expect(v).toEqual({ kind: 'progress', title: 'อัปเดตความคืบหน้า', lines: [], warnings: [], groups: [
      { mark: 'BUH1-3', isNew: false, parts: [], values: [{ field: 'Done', from: '1', to: '2' }, { field: 'QC Passed', from: '—', to: '2' }] },
    ] })
  })

  it('an edit that followed the MO is grouped by mark like MO History', () => {
    const v = woHistoryView(ev('EDIT', { notes: 'อัปเดตตามการแก้ที่ MO: BUH1-3 L 10550 → 10600 · BUH1-3 C-wx58 L 10550 → 10600' }), [])
    expect(v.kind).toBe('mo')
    expect(v.title).toBe('อัปเดตตามการแก้ที่ MO')
    expect(v.groups).toEqual([{ mark: 'BUH1-3', isNew: false, values: [{ field: 'L', from: '10550', to: '10600' }],
      parts: [{ action: 'change', part_mark: 'C-wx58', changes: [{ field: 'L', from: '10550', to: '10600' }] }] }])
  })

  it('own edits (dates, consume, part withdrawal) and creation keep their text as lines / title', () => {
    expect(woHistoryView(ev('EDIT', { notes: 'แก้ยอดเบิก part: C-f1 2 → 4' }), [])).toMatchObject({ kind: 'edit', title: 'แก้ยอดเบิก part', lines: ['C-f1 2 → 4'], groups: [] })
    expect(woHistoryView(ev('CREATED', { notes: 'สร้าง WO · 1 mark: BUH1-3 ×2' }), [])).toMatchObject({ kind: 'create', title: 'สร้าง WO · 1 mark: BUH1-3 ×2', lines: [] })
  })
})
