import { Prisma } from '@prisma/client'
import { FIELD_LABEL, diffProgress, toNum } from './progress-changes'

describe('toNum', () => {
  it('converts Decimal/number and keeps null', () => {
    expect(toNum(new Prisma.Decimal('5.000'))).toBe(5)
    expect(toNum(3)).toBe(3)
    expect(toNum(null)).toBeNull()
    expect(toNum(undefined)).toBeNull()
  })
})

describe('diffProgress', () => {
  it('returns only fields that changed, in canonical order', () => {
    const before = { qty_done: new Prisma.Decimal(5), qty_qc_passed: new Prisma.Decimal(4), qty_rework: null }
    const after = { qty_qc_passed: 6, qty_done: 8, qty_rework: null }
    expect(diffProgress(before, after)).toEqual([
      { field: 'qty_done', old: 5, new: 8 },
      { field: 'qty_qc_passed', old: 4, new: 6 },
    ])
  })
  it('ignores keys that are undefined in `after` (not being written)', () => {
    expect(diffProgress({ qty_done: 5 }, { qty_done: undefined })).toEqual([])
  })
  it('records null → value and planned changes', () => {
    expect(diffProgress({ qty_not_started: null, qty_planned: 10 }, { qty_not_started: 10, qty_planned: 8 })).toEqual([
      { field: 'qty_planned', old: 10, new: 8 },
      { field: 'qty_not_started', old: null, new: 10 },
    ])
  })
  it('treats Decimal and number of equal value as unchanged', () => {
    expect(diffProgress({ qty_done: new Prisma.Decimal('2.000') }, { qty_done: 2 })).toEqual([])
  })
  // Fix wave 2026-10-05: blank (null) and 0 mean the same to every rule, so a
  // first save must not log "In Progress — → 0" noise.
  it('treats null and 0 as equal for the six editable fields', () => {
    const before = { qty_not_started: 10, qty_in_progress: null, qty_done: null, qty_qc_passed: 0, qty_rework: null, qty_renew: new Prisma.Decimal(0) }
    const after = { qty_not_started: 2, qty_in_progress: 0, qty_done: 8, qty_qc_passed: null, qty_rework: 0, qty_renew: null }
    expect(diffProgress(before, after)).toEqual([
      { field: 'qty_not_started', old: 10, new: 2 },
      { field: 'qty_done', old: null, new: 8 },
    ])
  })
  it('still records null ↔ 0 for qty_planned', () => {
    expect(diffProgress({ qty_planned: null }, { qty_planned: 0 })).toEqual([{ field: 'qty_planned', old: null, new: 0 }])
  })
})

describe('FIELD_LABEL', () => {
  it('maps every progress field to its UI column label', () => {
    expect(FIELD_LABEL).toEqual({
      qty_planned: 'Quantity',
      qty_not_started: 'Not Started',
      qty_in_progress: 'In Progress',
      qty_done: 'Done',
      qty_qc_passed: 'QC Passed',
      qty_rework: 'Rework',
      qty_renew: 'Renew',
    })
  })
})
