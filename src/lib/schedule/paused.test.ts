import { describe, expect, it } from 'vitest'
import { makeBoard, wc, wo } from './testBoard'
import { pausedWarnings } from './paused'

describe('pausedWarnings', () => {
  it('lists PAUSED WOs with their work center, reason, who and Bangkok date', () => {
    const board = makeBoard({
      work_centers: [wc(25, 'WC-PAINT')],
      work_orders: [
        wo(5, 1, { status: 'PAUSED', wo_code: 'WO-IN-5', work_center_id: 25,
          pause: { reason: 'รอ shop drawing', by: 'admin', at: '2026-10-01T03:20:56.000Z' } }),
        wo(6, 1, { status: 'IN_PROGRESS' }),
      ],
    })
    expect(pausedWarnings(board)).toEqual(['WO-IN-5 · WC-PAINT — รอ shop drawing (admin · 1/10/2026)'])
  })

  it('a paused WO without a recorded reason still shows', () => {
    const board = makeBoard({ work_centers: [wc(25, 'WC-PAINT')], work_orders: [wo(7, 1, { status: 'PAUSED', wo_code: 'WO-7', work_center_id: 25 })] })
    expect(pausedWarnings(board)).toEqual(['WO-7 · WC-PAINT — ไม่ได้ระบุเหตุผล'])
  })
})
