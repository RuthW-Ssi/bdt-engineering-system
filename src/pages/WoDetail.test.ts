import { buildCancelPayload, buildDoneMarksPayload, allMarksQcPassed, clampQtyEdit } from './WoDetail'
import type { MarkEdits } from '../components/wo/WoMarksTable'
import type { QcBreakdown } from '../components/wo/QcBreakdownFields'

// NOTE on scope: WoDetail.tsx itself (react-router params, useWo/useWoDone/
// useWoCancel/etc. hooks, the sticky header, tab bar) isn't mounted here —
// same "extract and test the pure piece" precedent as qcBreakdownValid /
// findLatestPdfForMark / formatMarks elsewhere in this codebase. These two
// functions are exactly the new payload-building logic the multi-mark
// redesign added to this page (Done's per-mark array, Cancel's per-mark QC
// breakdown array, 2026-09-23 — was qty_reusable) — the Marks table's own
// interactions are covered in WoMarksTable.test.tsx.

function bomAssembly(mark: string) {
  return {
    id: 1, assembly_mark: mark, name: null, length_mm: null, surface_area_m2: null,
    weight_kg: null, width_mm: null, height_mm: null,
    dispatch: { id: 1, project: null, zone: null, sub_zone: null },
  }
}

function mark(overrides: {
  bom_assembly_id?: number
  removed_at?: string | null
  qty_planned?: number | string
  qty_not_started?: number | string | null
  qty_in_progress?: number | string | null
  qty_done?: number | string | null
  qty_qc_passed?: number | string | null
  qty_rework?: number | string | null
  qty_renew?: number | string | null
  assembly_mark?: string
} = {}) {
  return {
    bom_assembly_id: overrides.bom_assembly_id ?? 1,
    removed_at: overrides.removed_at ?? null,
    // Generously high default so existing tests that don't care about the
    // Quantity ceiling (buildDoneMarksPayload/buildCancelPayload) are unaffected.
    qty_planned: overrides.qty_planned ?? 1000,
    qty_not_started: overrides.qty_not_started ?? null,
    qty_in_progress: overrides.qty_in_progress ?? null,
    qty_done: overrides.qty_done ?? null,
    qty_qc_passed: overrides.qty_qc_passed ?? null,
    qty_rework: overrides.qty_rework ?? null,
    qty_renew: overrides.qty_renew ?? null,
    bom_assembly: bomAssembly(overrides.assembly_mark ?? 'A1'),
  }
}

function breakdown(overrides: Partial<QcBreakdown> = {}): QcBreakdown {
  return { qty_qc_passed: '', qty_rework: '', qty_renew: '', ...overrides }
}

describe('buildDoneMarksPayload', () => {
  it('errors when the WO has no non-removed marks', () => {
    const result = buildDoneMarksPayload([mark({ removed_at: '2026-01-01T00:00:00Z' })], {})
    expect(result).toEqual({ error: expect.stringContaining('no marks') })
  })

  it('uses each mark\'s edited draft value over its server value', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 3 })]
    const edits: MarkEdits = { 1: { qty_done: '9' } }
    const result = buildDoneMarksPayload(marks, edits)
    expect(result).toEqual({ marks: [{ bom_assembly_id: 1, qty_done: 9, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined }] })
  })

  it('falls back to each mark\'s last server value when there is no edit', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 5, qty_qc_passed: 4, qty_rework: 1 })]
    const result = buildDoneMarksPayload(marks, {})
    expect(result).toEqual({ marks: [{ bom_assembly_id: 1, qty_done: 5, qty_qc_passed: 4, qty_rework: 1, qty_renew: undefined }] })
  })

  it('omits QC breakdown fields (undefined, not 0) when they resolve to blank', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 5 })]
    const result = buildDoneMarksPayload(marks, {})
    expect(result).toEqual({ marks: [{ bom_assembly_id: 1, qty_done: 5, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined }] })
  })

  it('skips removed marks entirely, even if they have server qty_done', () => {
    const marks = [
      mark({ bom_assembly_id: 1, qty_done: 5 }),
      mark({ bom_assembly_id: 2, qty_done: 3, removed_at: '2026-01-01T00:00:00Z', assembly_mark: 'A2' }),
    ]
    const result = buildDoneMarksPayload(marks, {})
    expect(result).toEqual({ marks: [{ bom_assembly_id: 1, qty_done: 5, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined }] })
  })

  it('errors, naming the mark, when a non-removed mark has no qty_done at all', () => {
    const marks = [mark({ bom_assembly_id: 1, assembly_mark: 'DBN-B1-CTR10' })]
    const result = buildDoneMarksPayload(marks, {})
    expect(result).toEqual({ error: expect.stringContaining('DBN-B1-CTR10') })
  })

  it('errors when the edited qty_done is negative', () => {
    const marks = [mark({ bom_assembly_id: 1 })]
    const result = buildDoneMarksPayload(marks, { 1: { qty_done: '-1' } })
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('builds one entry per non-removed mark, in order, carrying its own QC breakdown', () => {
    const marks = [
      mark({ bom_assembly_id: 1, qty_done: 5, assembly_mark: 'A1' }),
      mark({ bom_assembly_id: 2, qty_done: 2, assembly_mark: 'A2' }),
    ]
    const edits: MarkEdits = { 1: { qty_qc_passed: '4', qty_rework: '1' }, 2: { qty_renew: '2' } }
    const result = buildDoneMarksPayload(marks, edits)
    expect(result).toEqual({
      marks: [
        { bom_assembly_id: 1, qty_done: 5, qty_qc_passed: 4, qty_rework: 1, qty_renew: undefined },
        { bom_assembly_id: 2, qty_done: 2, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: 2 },
      ],
    })
  })

  it('carries qty_not_started/qty_in_progress from edits, same as the QC fields', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 5 })]
    const edits: MarkEdits = { 1: { qty_not_started: '2', qty_in_progress: '3' } }
    const result = buildDoneMarksPayload(marks, edits)
    expect(result).toEqual({
      marks: [{ bom_assembly_id: 1, qty_not_started: 2, qty_in_progress: 3, qty_done: 5, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined }],
    })
  })

  it('falls back to each mark\'s last server qty_not_started/qty_in_progress when there is no edit', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_not_started: 1, qty_in_progress: 4, qty_done: 5 })]
    const result = buildDoneMarksPayload(marks, {})
    expect(result).toEqual({
      marks: [{ bom_assembly_id: 1, qty_not_started: 1, qty_in_progress: 4, qty_done: 5, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined }],
    })
  })
})

describe('buildCancelPayload', () => {
  it('errors when the reason is blank', () => {
    expect(buildCancelPayload([], '', {})).toEqual({ error: expect.any(String) })
    expect(buildCancelPayload([], '   ', {})).toEqual({ error: expect.any(String) })
  })

  it('trims the reason', () => {
    const result = buildCancelPayload([], '  scrap run  ', {})
    expect(result).toEqual({ reason: 'scrap run', mark_disposition: undefined })
  })

  it('omits mark_disposition entirely when no mark has output', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: null }), mark({ bom_assembly_id: 2, qty_done: 0, assembly_mark: 'A2' })]
    const result = buildCancelPayload(marks, 'reason', {})
    expect(result).toEqual({ reason: 'reason', mark_disposition: undefined })
  })

  it('excludes a removed mark from the with-output set even if it has qty_done > 0', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 5, removed_at: '2026-01-01T00:00:00Z' })]
    const result = buildCancelPayload(marks, 'reason', {})
    expect(result).toEqual({ reason: 'reason', mark_disposition: undefined })
  })

  it('errors, naming the mark, when a mark with output has no QC breakdown entered', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 5, assembly_mark: 'DBN-B1-CTR10' })]
    const result = buildCancelPayload(marks, 'reason', {})
    expect(result).toEqual({ error: expect.stringContaining('DBN-B1-CTR10') })
  })

  it('errors when the QC breakdown sum exceeds that mark\'s qty_done', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 5 })]
    const result = buildCancelPayload(marks, 'reason', { 1: breakdown({ qty_qc_passed: '6' }) })
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('accepts an all-zero QC breakdown for a mark with output', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_done: 5 })]
    const result = buildCancelPayload(marks, 'reason', { 1: breakdown({ qty_qc_passed: '0', qty_rework: '0', qty_renew: '0' }) })
    expect(result).toEqual({ reason: 'reason', mark_disposition: [{ bom_assembly_id: 1, qty_qc_passed: 0, qty_rework: 0, qty_renew: 0 }] })
  })

  it('builds one mark_disposition entry per mark with output, leaving no-output marks out', () => {
    const marks = [
      mark({ bom_assembly_id: 1, qty_done: 5, assembly_mark: 'A1' }),
      mark({ bom_assembly_id: 2, qty_done: null, assembly_mark: 'A2' }),
      mark({ bom_assembly_id: 3, qty_done: 2, assembly_mark: 'A3' }),
    ]
    const result = buildCancelPayload(marks, 'reason', {
      1: breakdown({ qty_qc_passed: '3', qty_rework: '1' }),
      3: breakdown({ qty_qc_passed: '2' }),
    })
    expect(result).toEqual({
      reason: 'reason',
      mark_disposition: [
        { bom_assembly_id: 1, qty_qc_passed: 3, qty_rework: 1, qty_renew: undefined },
        { bom_assembly_id: 3, qty_qc_passed: 2, qty_rework: undefined, qty_renew: undefined },
      ],
    })
  })
})

describe('allMarksQcPassed', () => {
  it('is false when the WO has no non-removed marks', () => {
    expect(allMarksQcPassed([mark({ removed_at: '2026-01-01T00:00:00Z' })], {})).toBe(false)
  })

  it('is false when a mark has no qty_qc_passed at all', () => {
    expect(allMarksQcPassed([mark({ qty_planned: 5 })], {})).toBe(false)
  })

  it('is false when any mark\'s QC Passed is below its Quantity, using the server value', () => {
    const marks = [
      mark({ bom_assembly_id: 1, qty_planned: 5, qty_qc_passed: 5, assembly_mark: 'A1' }),
      mark({ bom_assembly_id: 2, qty_planned: 3, qty_qc_passed: 2, assembly_mark: 'A2' }),
    ]
    expect(allMarksQcPassed(marks, {})).toBe(false)
  })

  it('is true once every non-removed mark\'s QC Passed equals its Quantity, using the server value', () => {
    const marks = [
      mark({ bom_assembly_id: 1, qty_planned: 5, qty_qc_passed: 5, assembly_mark: 'A1' }),
      mark({ bom_assembly_id: 2, qty_planned: 3, qty_qc_passed: 3, assembly_mark: 'A2' }),
    ]
    expect(allMarksQcPassed(marks, {})).toBe(true)
  })

  it('prefers the current draft edit over the last server value', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_planned: 5, qty_qc_passed: 2 })]
    expect(allMarksQcPassed(marks, { 1: { qty_qc_passed: '5' } })).toBe(true)
    expect(allMarksQcPassed(marks, { 1: { qty_qc_passed: '' } })).toBe(false)
  })

  it('ignores removed marks entirely', () => {
    const marks = [
      mark({ bom_assembly_id: 1, qty_planned: 5, qty_qc_passed: 5, assembly_mark: 'A1' }),
      mark({ bom_assembly_id: 2, qty_planned: 3, qty_qc_passed: null, removed_at: '2026-01-01T00:00:00Z', assembly_mark: 'A2' }),
    ]
    expect(allMarksQcPassed(marks, {})).toBe(true)
  })
})

describe('clampQtyEdit', () => {
  it('caps a value above the mark\'s own qty_planned down to it (2026-09-23: "32" typed against Quantity 1)', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_planned: 1 })]
    expect(clampQtyEdit(marks, 1, '32')).toBe('1')
  })

  it('leaves a value at or below qty_planned untouched', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_planned: 5 })]
    expect(clampQtyEdit(marks, 1, '5')).toBe('5')
    expect(clampQtyEdit(marks, 1, '3')).toBe('3')
  })

  it('leaves a blank value untouched (clearing the field stays valid)', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_planned: 5 })]
    expect(clampQtyEdit(marks, 1, '')).toBe('')
  })

  it('clamps per-mark, so a bulk-applied value only clamps the marks it actually exceeds', () => {
    const marks = [
      mark({ bom_assembly_id: 1, qty_planned: 1, assembly_mark: 'A1' }),
      mark({ bom_assembly_id: 2, qty_planned: 10, assembly_mark: 'A2' }),
    ]
    expect(clampQtyEdit(marks, 1, '3')).toBe('1')
    expect(clampQtyEdit(marks, 2, '3')).toBe('3')
  })

  it('leaves the value untouched when the mark is not found (defensive)', () => {
    expect(clampQtyEdit([], 1, '99')).toBe('99')
  })

  it('clamps a negative value up to 0 (2026-09-23: "ค่า min ต้อง = 0 ห้ามใส่ติดลบ")', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_planned: 5 })]
    expect(clampQtyEdit(marks, 1, '-1')).toBe('0')
    expect(clampQtyEdit(marks, 1, '-99')).toBe('0')
  })

  it('leaves 0 itself untouched', () => {
    const marks = [mark({ bom_assembly_id: 1, qty_planned: 5 })]
    expect(clampQtyEdit(marks, 1, '0')).toBe('0')
  })

  it('clamps a negative value to 0 even when the mark is not found (min bound is unconditional)', () => {
    expect(clampQtyEdit([], 1, '-5')).toBe('0')
  })
})
