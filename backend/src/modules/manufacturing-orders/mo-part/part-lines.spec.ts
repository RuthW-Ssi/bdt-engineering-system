import { groupBomPartsBySize, sizeKey, validateMarks, validatePartLines } from './part-lines'

describe('sizeKey', () => {
  it('ignores case and surrounding spaces in profile/grade, normalises length', () => {
    expect(sizeKey({ profile: ' pl20x950 ', grade: 'sm520', length_mm: 8550 }))
      .toBe(sizeKey({ profile: 'PL20X950', grade: 'SM520', length_mm: 8550.0 }))
  })
})

describe('validatePartLines', () => {
  const ok = { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 6 }
  it('accepts a valid list', () => {
    expect(validatePartLines([ok])).toEqual([])
  })
  it('rejects an empty list', () => {
    expect(validatePartLines([])).toEqual(['At least one line is required'])
  })
  it('names the row for blank profile/grade, non-positive length, non-integer qty', () => {
    const errs = validatePartLines([{ ...ok, profile: ' ', grade: '', length_mm: 0, qty: 1.5 }])
    expect(errs).toEqual([
      'Row 1: profile is required',
      'Row 1: grade is required',
      'Row 1: length must be > 0',
      'Row 1: qty must be a whole number > 0',
    ])
  })
  it('rejects negative weight', () => {
    expect(validatePartLines([{ ...ok, unit_weight_kg: -1 }])).toEqual(['Row 1: weight must be ≥ 0'])
  })
  it('rejects the same size twice, naming both rows', () => {
    expect(validatePartLines([ok, { ...ok, profile: 'pl25x400', qty: 2 }]))
      .toEqual(['Rows 1 and 2 are the same size (PL25x400 SM520 10550) — merge them'])
  })
})

describe('groupBomPartsBySize', () => {
  const p = (id: number, mark: string, qty: number, extra: Partial<{ profile: string; length_mm: number; weight_kg: number }> = {}) =>
    ({ id, part_mark: mark, profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty, weight_kg: 828.17, ...extra })

  it('sums bom_part.qty per size and keeps every id', () => {
    const { lines, skipped } = groupBomPartsBySize([p(1, 'C-f1', 6), p(2, 'C-f9', 2), p(3, 'C-wx26', 1, { profile: 'PL20x950', weight_kg: 1573.53 })])
    expect(skipped).toEqual([])
    expect(lines).toEqual([
      { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 8, unit_weight_kg: 828.17, part_mark: 'C-f1, C-f9', bom_part_ids: [1, 2] },
      { profile: 'PL20x950', grade: 'SM520', length_mm: 10550, qty: 1, unit_weight_kg: 1573.53, part_mark: 'C-wx26', bom_part_ids: [3] },
    ])
  })
  it('skips parts missing profile, grade, length or qty and reports their marks', () => {
    const { lines, skipped } = groupBomPartsBySize([p(1, 'C-f1', 6), { ...p(2, 'X-1', 1), profile: null }, { ...p(3, 'X-2', 1), qty: null }])
    expect(lines).toHaveLength(1)
    expect(skipped).toEqual(['X-1', 'X-2'])
  })
  it('leaves unit weight empty when parts of one size disagree on weight', () => {
    const { lines } = groupBomPartsBySize([p(1, 'A', 1), p(2, 'B', 1, { weight_kg: 900 })])
    expect(lines[0].unit_weight_kg).toBeNull()
  })
})

describe('round 3 — marks and per-(mark, part mark, size) duplicates', () => {
  const L = { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 4 }
  it('allows the same size under different marks and part marks', () => {
    expect(validatePartLines([{ ...L, mark: 'A' }, { ...L, mark: 'B' }, { ...L, part_mark: 'x-p1' }, { ...L, part_mark: 'x-p2' }], ['A', 'B'])).toEqual([])
  })
  it('rejects the same size twice under one mark', () => {
    expect(validatePartLines([{ ...L, mark: 'A' }, { ...L, mark: 'A' }], ['A']))
      .toEqual(['Rows 1 and 2 are the same size (PL25x400 SM520 10550) under mark A — merge them'])
  })
  it('rejects a line whose mark is not in the mark list', () => {
    expect(validatePartLines([{ ...L, mark: 'Z' }], ['A'])).toEqual(['Row 1: mark Z is not in the mark list'])
  })
  it('validates holes and cut length', () => {
    expect(validatePartLines([{ ...L, holes: [{ diameter_mm: 0, count: 2 }], cut_length_mm: -1 }]))
      .toEqual(['Row 1: hole diameter and count must be > 0', 'Row 1: cut length must be ≥ 0'])
  })
})

describe('validateMarks', () => {
  const M = { mark: 'BUH1-3', set_qty: 2, length_mm: 10550, width_mm: 400, height_mm: 1200 }
  it('accepts valid marks, including blank dimensions', () => {
    expect(validateMarks([M, { mark: 'X', set_qty: 1, length_mm: null, width_mm: null, height_mm: null }])).toEqual([])
  })
  it('names blank, duplicate and zero-set marks', () => {
    expect(validateMarks([{ ...M, mark: ' ' }, M, M, { ...M, mark: 'Y', set_qty: 0 }])).toEqual([
      'Mark row 1: mark is required',
      'Mark BUH1-3 appears twice',
      'Mark Y: set must be > 0',
    ])
  })
})
