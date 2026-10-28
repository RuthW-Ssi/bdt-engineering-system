import { cancelledNote, diffLines, formerMarksText, uploadLabel, orderReviewRows, renameNote, revError, revMoveText, revUpOf, rowResult } from './markRev'
import type { RevReviewRowDto } from '../../api/dispatches'

describe('revMoveText / revUpOf', () => {
  it('"Rev 1 → 2", plus "ข้อมูล BOM ไม่เปลี่ยน" for a hand-raised rev with no data change', () => {
    expect(revMoveText({ from: 1, to: 2 }, false)).toBe('Rev 1 → 2')
    expect(revMoveText({ from: 1, to: 2 }, true)).toBe('Rev 1 → 2 · ข้อมูล BOM ไม่เปลี่ยน')
    expect(revMoveText(null, true)).toBeNull()
  })
  it('reads REV_UP out of a WO bom-version status', () => {
    expect(revUpOf({ delta_types: ['REV_UP'], delta_details: { rev: { from: 0, to: 3 } } })).toEqual({ from: 0, to: 3 })
    expect(revUpOf({ delta_types: ['SPEC_CHANGED'], delta_details: null })).toBeNull()
    expect(revUpOf(null)).toBeNull()
  })
})

const row = (over: Partial<RevReviewRowDto> = {}): RevReviewRowDto => ({
  mark: 'B1', kind: 'changed', prev_rev: 1, suggested_rev: 2, suggested_source: 'MANUAL', dn_rev: null, dn_status: null,
  in_dn: false, warning: 'CHANGED_NO_REV_UP', dn_cancelled_in_files: false, rename_hint: null, editable: true, diff: null, ...over,
})

describe('review helpers', () => {
  it('diffLines: assembly fields, parts added / removed / changed — plain labels', () => {
    expect(diffLines({
      fields: [{ field: 'length_mm', old: 650, new: 700 }, { field: 'qty', old: 2, new: null }],
      parts_added: [{ part_mark: 'p2', qty: 1, description: null, profile: null, grade: null, length_mm: null, weight_kg: null }],
      parts_removed: [{ part_mark: 'p3', qty: 1, description: null, profile: null, grade: null, length_mm: null, weight_kg: null }],
      parts_changed: [{ part_mark: 'p1', changes: [{ field: 'profile', old: 'L50x50', new: 'L60x60' }] }],
    })).toEqual(['L 650 → 700', 'ชุด 2 → —', 'เพิ่ม part p2', 'ลบ part p3', 'part p1: Profile L50x50 → L60x60'])
    expect(diffLines(null)).toEqual([])
  })

  it('rowResult: the ⚠ wording follows the spec, plain words otherwise', () => {
    expect(rowResult(row(), false)).toBe('⚠ ข้อมูลเปลี่ยน — ตรวจ rev ใหม่')
    expect(rowResult(row(), true)).toBe('⚠ ข้อมูลเปลี่ยน แต่ไม่มีใน Dispatch Note — ตรวจ rev ใหม่')
    expect(rowResult(row({ in_dn: true }), true)).toBe('⚠ ข้อมูลเปลี่ยน แต่ Dispatch Note ไม่ได้ขึ้น rev — ตรวจ rev ใหม่')
    expect(rowResult(row({ kind: 'unchanged', warning: 'REV_UP_NO_CHANGE' }), true)).toBe('⚠ rev ขึ้นแต่ข้อมูลไม่เปลี่ยน')
    expect(rowResult(row({ kind: 'unchanged', warning: 'DN_REV_LOWER', dn_rev: 0 }), true)).toBe('⚠ Dispatch Note บอก rev 0 ต่ำกว่า rev ปัจจุบัน')
    expect(rowResult(row({ kind: 'added', warning: null }), true)).toBe('mark ใหม่')
    expect(rowResult(row({ kind: 'removed', warning: null }), true)).toBe('ถูกลบออกจาก BOM')
    expect(rowResult(row({ kind: 'changed', warning: null }), true)).toBe('ข้อมูลเปลี่ยน')
    expect(rowResult(row({ kind: 'unchanged', warning: null }), true)).toBe('ไม่เปลี่ยน')
  })

  it('cancelledNote: DN STATUS cancelled but still in the Tekla lists → a plain ⚠ line, else nothing', () => {
    expect(cancelledNote(row({ dn_cancelled_in_files: true, dn_status: 'cancelled' }))).toBe('⚠ Dispatch Note บอกว่ายกเลิก แต่ยังมีในไฟล์ Tekla — ถ้ายกเลิกจริง ให้ลบใน Tekla แล้วอัปโหลดใหม่')
    expect(cancelledNote(row())).toBeNull()
  })

  it('renameNote: new mark → "อาจเปลี่ยนชื่อจาก …", removed → "อาจเปลี่ยนชื่อเป็น …", else nothing', () => {
    expect(renameNote(row({ kind: 'added', rename_hint: 'DBN-B1-BR10' }))).toBe('อาจเปลี่ยนชื่อจาก DBN-B1-BR10 — จับคู่ชื่อได้หลังบันทึก')
    expect(renameNote(row({ kind: 'removed', rename_hint: '3DBN-B1-BR10' }))).toBe('อาจเปลี่ยนชื่อเป็น 3DBN-B1-BR10')
    expect(renameNote(row())).toBeNull()
  })

  it('orderReviewRows: a hinted removed row sits right under its new mark; other order kept', () => {
    const rows = [row({ mark: 'A' }), row({ mark: 'N', kind: 'added', rename_hint: 'G' }), row({ mark: 'B' }), row({ mark: 'X', kind: 'removed' }), row({ mark: 'G', kind: 'removed', rename_hint: 'N' })]
    expect(orderReviewRows(rows).map(r => r.mark)).toEqual(['A', 'N', 'G', 'B', 'X'])
  })

  it('formerMarksText: "เดิม X" (nearest first, joined by ←), nothing when never renamed', () => {
    expect(formerMarksText(['DBN-B1-BR10'])).toBe('เดิม DBN-B1-BR10')
    expect(formerMarksText(['2BR10', 'BR10'])).toBe('เดิม 2BR10 ← BR10')
    expect(formerMarksText([])).toBeNull()
    expect(formerMarksText(undefined)).toBeNull()
  })

  it('uploadLabel: "v.n" (Tao 2026-10-27, was "อัปโหลดครั้งที่ n"), "v.—" when unknown', () => {
    expect(uploadLabel(2)).toBe('v.2')
    expect(uploadLabel('3')).toBe('v.3')
    expect(uploadLabel(null)).toBe('v.—')
    expect(uploadLabel(undefined)).toBe('v.—')
  })

  it('revError: whole number, ≤ 999, never below the current rev', () => {
    expect(revError(row(), '2')).toBeNull()
    expect(revError(row({ kind: 'unchanged', warning: 'REV_UP_NO_CHANGE' }), '1')).toBeNull()
    expect(revError(row(), '0')).toBe('ต่ำกว่า Rev เดิม (1) ไม่ได้')
    expect(revError(row(), '')).toBe('ใส่เลข rev')
    expect(revError(row(), '1.5')).toBe('ใส่เลข rev')
    expect(revError(row(), '1000')).toBe('rev สูงสุด 999')
  })

  it('revError: changed data must raise the rev above the current one (mirrors finalizeRevs)', () => {
    expect(revError(row(), '1')).toBe('ข้อมูลของ mark นี้เปลี่ยน ต้องใส่ rev มากกว่า 1')
    // a changed row the Dispatch Note already raised (no ⚠) follows the same rule
    expect(revError(row({ warning: null, suggested_source: 'DISPATCH_NOTE', dn_rev: 3, suggested_rev: 3 }), '1')).toBe('ข้อมูลของ mark นี้เปลี่ยน ต้องใส่ rev มากกว่า 1')
    expect(revError(row({ kind: 'unchanged', warning: 'DN_REV_LOWER', dn_rev: 0 }), '1')).toBeNull()
  })
})
