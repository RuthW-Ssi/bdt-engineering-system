import { dataSetOf, paintSetEqual, restoreProgress, snapshotProgress, undoBlockReason } from './rename-carry'

describe('rename-carry', () => {
  it('snapshot → restore round-trips dates and numbers exactly', () => {
    const row = { cut: 50, buildup: 0, weld1: 0, fitup_drill: 0, weld2: 0, qc_inspection: 0, primer: 0, fireproof: 0, top_coat: 0, qc_final: 0,
      fab_plan_finish_date: new Date('2026-10-30T00:00:00.000Z'), fab_actual_finish_date: null, plan_load_date: null, actual_load_date: null,
      loaded_pcs: 2, erected_pcs: 0, erection_plan_finish_date: null, erection_actual_finish_date: null, payment_status: 'Not Disbursed', write_uid: 9 }
    const snap = snapshotProgress(row)
    expect(snap.fab_plan_finish_date).toBe('2026-10-30T00:00:00.000Z')
    expect(snap).not.toHaveProperty('write_uid')
    const back = restoreProgress(JSON.parse(JSON.stringify(snap)))
    expect(back.fab_plan_finish_date).toEqual(new Date('2026-10-30T00:00:00.000Z'))
    expect([back.cut, back.loaded_pcs, back.payment_status]).toEqual([50, 2, 'Not Disbursed'])
  })

  it('dataSetOf lists only what differs from "not started", null when nothing', () => {
    expect(dataSetOf(null, [])).toBeNull()
    expect(dataSetOf({ cut: 0, payment_status: 'Not Disbursed', loaded_pcs: 0 }, [])).toBeNull()
    expect(dataSetOf({ cut: 50, payment_status: 'Not Disbursed' }, [{ paint_type: 'primer', layers: 2, material: { name: 'Zinc' } }])).toEqual({
      progress: [{ field: 'cut', value: 50 }],
      paint: [{ paint_type: 'primer', material: 'Zinc', layers: 2 }],
    })
  })

  it('undoBlockReason: used → refused; newer version → refused; progress after pairing → refused; paint after pairing → refused (fix round 1, ruling 4); else null', () => {
    const ok = { used_at: null, toActive: true, progressEditedAfter: false, paintEditedAfter: false, to_mark: '3BUH1B-18' }
    expect(undoBlockReason(ok)).toBeNull()
    expect(undoBlockReason({ ...ok, used_at: new Date() })).toBe('มี MO หรือ WO ใช้ชื่อ 3BUH1B-18 ตามคู่นี้แล้ว — ยกเลิกคู่ไม่ได้')
    expect(undoBlockReason({ ...ok, toActive: false })).toBe('มี BOM version ใหม่กว่าแล้ว — ยกเลิกคู่ได้เฉพาะ version ล่าสุด')
    expect(undoBlockReason({ ...ok, progressEditedAfter: true })).toBe('มีคนกรอก Project Progress ของ 3BUH1B-18 หลังจับคู่แล้ว — ยกเลิกคู่ไม่ได้')
    expect(undoBlockReason({ ...ok, paintEditedAfter: true })).toBe('แก้ค่าสีของ mark นี้หลังจับคู่แล้ว — ยกเลิกคู่ไม่ได้')
  })

  it('paintSetEqual: same (paint_type, material_id, layers) content regardless of order → equal (fix round 1, ruling 4)', () => {
    const a = [{ paint_type: 'primer', material_id: 1, layers: 2 }, { paint_type: 'topcoat', material_id: 1, layers: 1 }]
    const b = [{ paint_type: 'topcoat', material_id: 1, layers: 1 }, { paint_type: 'primer', material_id: 1, layers: 2 }]
    expect(paintSetEqual(a, b)).toBe(true)
    expect(paintSetEqual(a, [])).toBe(false)
    expect(paintSetEqual(a, [{ paint_type: 'primer', material_id: 1, layers: 3 }, { paint_type: 'topcoat', material_id: 1, layers: 1 }])).toBe(false)
    expect(paintSetEqual([], [])).toBe(true)
  })
})
