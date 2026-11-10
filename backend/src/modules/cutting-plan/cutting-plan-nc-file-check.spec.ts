import { countDistinctPlates, isLikelyMultiPlate, reportCharge } from './cutting-plan-nc-file-check'

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

// Real Used Material blocks (CRLF, as CutLogic writes them). The Charge is the plate's name in the report,
// which is not always its file name: CP_2024_09_0413325 has file Z332-10-1.txt saying Charge Z322-10-1.
describe('reportCharge', () => {
  const block = (row: string) => [
    'NESTING',
    'Used Material\tUsage',
    'Article Number\tCount\tPlate Number \tCharge\tQuality\tThick.\tWidth\tLength\t2\tkg\tNesting % ',
    'm',
    row,
    'Orders',
  ].join('\r\n')

  it('reads the Charge cell of the plate row', () => {
    expect(reportCharge(block('108\t1\t14038 \t224-F7-20-4\tSM520\t20.00\t1480\t6000\t2.88\t452\t77.49'))).toBe('224-F7-20-4')
  })

  it('keeps a Charge that CutLogic wrapped inside the cell (file 0X203-Z1-10-10)', () => {
    expect(reportCharge(block('5\t1\t12023 \t0X203-Z1-10-1 0 \tHY370\t10.00\t1460\t7600\t3.80\t298\t92.37'))).toBe('0X203-Z1-10-1 0')
  })

  it('returns null when there is no Used Material table', () => {
    expect(reportCharge('NESTING\r\nNC File\t:\t1.cld')).toBeNull()
  })
})
