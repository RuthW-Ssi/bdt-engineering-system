import { parserFileProblems, reportProblems } from './cutting-plan-report-check'

// Minimal report: only the parts the checks read
const report = (o: { nc?: string[]; plateRow?: string; remnants?: string[] } = {}) => [
  'NESTING',
  ...(o.nc ?? ['00000001.cld']).map(nc => `NC File\t:\t${nc}\tNeed Date\t:\t06.12.2025\t1 / \t2`),
  'Used Material\tUsage',
  'Article Number\tCount\tPlate Number \tCharge\tQuality\tThick.\tWidth\tLength\t2\tkg\tNesting % ',
  'm',
  o.plateRow ?? '5\t1\t12733 \tA-10-3\tHY370\t10.00\t1524\t6000\t2.96\t232\t72.93',
  'Orders',
  'Plate usage per order in kg',
  ...(o.remnants ? ['Remnants', '2', 'Plate Number\tDimensions\tArea\tm\tWeight kg\tCount', ...o.remnants] : []),
  'Machine times',
  'Total\t8.4\t130\t6.5\t14.9',
].join('\r\n')

describe('reportProblems', () => {
  it('passes a normal report, remnants included', () => {
    expect(reportProblems(report({ remnants: ['R4174\t3383 X 1524\t5.2\t405\t1', '12733-1-1'] }))).toEqual([])
  })

  // Real Z00-14-6 and 57 more legacy plates: the remnant row has its plate number and nothing else
  it('names every remnant that has no dimensions', () => {
    expect(reportProblems(report({ remnants: ['R2380', '', 'R2381\t', '12733-1-1'] }))).toEqual([
      { section: 'Remnants', problem: 'R2380 has no dimensions' },
      { section: 'Remnants', problem: 'R2381 has no dimensions' },
    ])
  })

  // Real X197-Z0-10-3 REV1.txt: pages 1/6, 2/6 and 4/6 of a batch exported into one file
  it('rejects a report that holds more than one plate', () => {
    expect(reportProblems(report({ nc: ['00009431.cld', '00009432.cld', '00009431.cld', '00009433.cld'] }))).toEqual([
      { section: 'Report', problem: 'Holds 3 plates (NC 00009431, 00009432, 00009433): export one report per plate' },
    ])
  })

  // Real Z100-5-1 (re-issued by hand): an extra empty cell after Article Number
  it('rejects a plate row whose cells do not line up with the header', () => {
    expect(reportProblems(report({ plateRow: '78\t\t1\t8739 \tZ100-5-1\tSS400\t5.00\t1480\t300\t0.44\t17\t70.23' }))).toEqual([
      { section: 'Used Material', problem: 'The plate row has 12 cells, the header has 11' },
    ])
  })

  // Article Number may be a material code (X190-Z1-3.2-1: "SS400_3.2_2000_600 0"); that is a plate row
  it('accepts a material-code Article Number', () => {
    expect(reportProblems(report({ plateRow: 'SS400_3.2_2000_600 0\t1\t10432 \tX190-Z1-3.2-1\tSS400\t3.20\t1219\t2438\t2.97\t75\t84.90' }))).toEqual([])
  })

  it('says when the plate row is missing', () => {
    expect(reportProblems(report({ plateRow: '' }))).toEqual([{ section: 'Used Material', problem: 'No plate row' }])
  })
})

describe('parserFileProblems', () => {
  it('turns the parser messages into a section and a plain problem', () => {
    expect(parserFileProblems([
      { file: 'A.txt', message: 'Text format in Remnants is not complatible with criteria. >>> Empty remnants data.' },
      { file: 'B.txt', message: 'Text format in Used Material is not complatible with criteria >>> 11 columns passed, passed data had 12 columns' },
      { file: 'C.txt', message: 'Something else broke' },
    ])).toEqual([
      { file: 'A.txt', section: 'Remnants', problem: 'Empty remnants data.' },
      { file: 'B.txt', section: 'Used Material', problem: '11 columns passed, passed data had 12 columns' },
      { file: 'C.txt', section: 'Report', problem: 'Something else broke' },
    ])
  })
})
