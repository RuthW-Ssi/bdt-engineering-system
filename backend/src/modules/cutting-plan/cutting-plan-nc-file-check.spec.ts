import { countDistinctPlates, isLikelyMultiPlate } from './cutting-plan-nc-file-check'

// Excerpts below are real lines from captured Cutting Plan report .txt files
// (not synthesized) — the exact "NC File" line format the summary block and
// the detail block each emit once per plate.
const SINGLE_PLATE_EXCERPT = [
  'NC File\t:\t00009430.cld\tNeed Date\t:\t26.08.2025\t1 / \t4',
  'NC File\t:\t00009430.cld\tNeed Date\t:\t26.8.2025\tDimensions\t:\t5.00 x 3870 x 1465\t26.8.2025 23:02',
].join('\n')

const MULTI_PLATE_EXCERPT = [
  'NC File\t:\t00009431.cld\tNeed Date\t:\t26.08.2025\t1 / \t6',
  'NC File\t:\t00009431.cld\tNeed Date\t:\t26.8.2025\tDimensions\t:\t10.00 x 5845 x 1465\t1.9.2025 10:25',
  'NC File\t:\t00009432.cld\tNeed Date\t:\t26.08.2025\t2 / \t6',
  'NC File\t:\t00009432.cld\tNeed Date\t:\t26.8.2025\tDimensions\t:\t10.00 x 4866 x 1465\t1.9.2025 10:25',
  'NC File\t:\t00009433.cld\tNeed Date\t:\t26.08.2025\t3 / \t6',
  'NC File\t:\t00009433.cld\tNeed Date\t:\t26.8.2025\tDimensions\t:\t10.00 x 3870 x 1465\t1.9.2025 10:25',
].join('\n')

describe('countDistinctPlates', () => {
  it('counts 1 distinct plate for a normal single-plate report (2 raw "NC File" lines, same token)', () => {
    expect(countDistinctPlates(SINGLE_PLATE_EXCERPT)).toBe(1)
  })

  it('counts N distinct plates for a bundled multi-plate report', () => {
    expect(countDistinctPlates(MULTI_PLATE_EXCERPT)).toBe(3)
  })

  it('counts 0 for content with no "NC File" lines', () => {
    expect(countDistinctPlates('nothing relevant here')).toBe(0)
  })
})

describe('isLikelyMultiPlate', () => {
  it('does NOT flag a normal single-plate report (regression guard against the raw-occurrence-count bug)', () => {
    expect(isLikelyMultiPlate(SINGLE_PLATE_EXCERPT)).toBe(false)
  })

  it('flags a bundled multi-plate report', () => {
    expect(isLikelyMultiPlate(MULTI_PLATE_EXCERPT)).toBe(true)
  })
})
