import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { parsePartList, PartListError } from './part-list'

// Real Tekla part list, 0X222 Driving Bangna NP zone 3 (17 Jun 2026). Its sheets repeat the same parts
// (full list, raw report, one sheet per size) and a pivot "Sum of No." sheet holds the totals.
const XLS = fs.readFileSync(path.join(__dirname, '__fixtures__', 'part-list-0x222-np-zone3.xls'))

describe('parsePartList', () => {
  it('reads one size per profile + grade, counted once, matching the pivot sheet', () => {
    const r = parsePartList(XLS)
    expect(r.sizes.map(s => [s.profile, s.grade, s.parts.reduce((n, p) => n + p.count, 0)])).toEqual([
      ['PIPE 101.6X2.4', 'HSS550', 176],
      ['PIPE 101.6X2.6', 'HSS550', 405],
      ['PIPE 113.5X2.4', 'HSS550', 541],
      ['PIPE 139.8X3.2', 'HSS550', 12],
      ['PIPE 165.2X4.5', 'SS500', 12],
      ['PIPE 60.5X2.4', 'HSS550', 432],
    ])
    expect(r.pieces).toBe(1578)
    expect(r.warnings).toEqual([])
  })

  it('keeps marks and lengths as written', () => {
    const p101 = parsePartList(XLS).sizes.find(s => s.profile === 'PIPE 101.6X2.4')!
    expect(p101.parts).toContainEqual({ mark: 'DBN-A3-m42', lengthMm: 9289.04, count: 8 })
    expect(p101.parts).toContainEqual({ mark: 'DBN-A3-m44', lengthMm: 500, count: 64 })
  })

  it('each size carries its kg per metre from the Weight per piece column', () => {
    const p101 = parsePartList(XLS).sizes.find(s => s.profile === 'PIPE 101.6X2.4')!
    expect(p101.kgPerM).toBeGreaterThan(5.8)
    expect(p101.kgPerM).toBeLessThan(5.95)
    expect(parsePartList(mixed()).sizes.every(s => s.kgPerM === null)).toBe(true) // no Weight column
  })

  it('a pivot total that disagrees with the rows is a warning', () => {
    const wb = XLSX.read(XLS, { type: 'buffer' })
    const pivot = wb.Sheets[wb.SheetNames[0]]
    pivot['C5'] = { t: 'n', v: 177 }
    const r = parsePartList(XLSX.write(wb, { type: 'buffer', bookType: 'xls' }))
    expect(r.warnings).toEqual(['PIPE 101.6X2.4: the summary sheet says 177 pcs, the part rows add up to 176'])
  })

  it('a file without Mark / Profile / No. / Length columns is refused', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]), 'S')
    expect(() => parsePartList(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))).toThrow(PartListError)
    expect(() => parsePartList(Buffer.from('not a spreadsheet'))).toThrow(PartListError)
  })

  // 2026-11-26 (L / BOX): a part list goes through the same profile families as the BOM — one spelling per size
  // ("L50X50X5" → "L 50X50X5", "RHS…" → "BOX …"), plates and bought items left out, shapes not laid out yet named
  const mixed = (pivot?: [string, number][]) => {
    const wb = XLSX.utils.book_new()
    if (pivot) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sum of  No.'], ['Profile', 'Grade', 'Total'], ...pivot.map(([p, n]) => [p, 'SS400', n])]), 'Sum')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Mark', 'Profile', 'No.', 'Grade', 'Length (mm)'],
      ['ESB-FB1', 'L50X50X5', 8, 'SS400', 995],
      ['ESB-FB2', 'L 50x50x5', 4, 'SS400', 640],
      ['ESB-m4', 'RHS100X50X2.3', 4, 'SS400', 2984],
      ['ESB-m2', 'SHS150X150X4.5', 4, 'SS400', 5819],
      ['ESB-P1', 'PL10', 20, 'SS400', 300],
      ['ESB-C1', 'COUPLING 1"THREAD R.', 6, 'SS400', 150],
      ['ESB-H1', 'I150X75X5.5X9.5', 2, 'SS400', 6000],
      ['ESB-X1', 'LC100X50X20X2.3', 3, 'SS400', 2000],
      ['DBN-m60', 'PIPE 60.5X2.4', 10, 'HSS550', 969.05],
    ]), 'Parts')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  }

  it('names sizes as the BOM does and lays out only the 1D shapes switched on', () => {
    const r = parsePartList(mixed())
    expect(r.sizes.map(s => [s.profile, s.grade, s.parts.reduce((n, p) => n + p.count, 0)])).toEqual([
      ['BOX 100X50X2.3', 'SS400', 4],
      ['BOX 150X150X4.5', 'SS400', 4],
      ['L 50X50X5', 'SS400', 12],
      ['PIPE 60.5X2.4', 'HSS550', 10],
    ])
    expect(r.pieces).toBe(30)
    expect(r.warnings).toEqual(['Unknown profile, not laid out: LC100X50X20X2.3 (1 mark, 3 pcs)', 'Not laid out yet: I (1 mark, 2 pcs)'])
  })

  it('the pivot is checked under the same names, plates and later shapes left out of the check', () => {
    expect(parsePartList(mixed([['L50X50X5', 12], ['RHS100X50X2.3', 4], ['SHS150X150X4.5', 4], ['PL10', 20], ['I150X75X5.5X9.5', 2], ['PIPE 60.5X2.4', 10]])).warnings)
      .toEqual(['Unknown profile, not laid out: LC100X50X20X2.3 (1 mark, 3 pcs)', 'Not laid out yet: I (1 mark, 2 pcs)'])
    expect(parsePartList(mixed([['L50X50X5', 13]])).warnings).toContain('L 50X50X5: the summary sheet says 13 pcs, the part rows add up to 12')
  })

  it('a part list with nothing to lay out (plates only) is refused, saying why', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Mark', 'Profile', 'No.', 'Grade', 'Length (mm)'], ['P1', 'PL10', 4, 'SS400', 300], ['H1', 'I150X75X5.5X9.5', 2, 'SS400', 6000]]), 'Parts')
    expect(() => parsePartList(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))).toThrow('No pipe, rod, box, L, C or H pieces in this part list (not laid out yet: I (1 mark, 2 pcs))')
  })

  it('a sleeve pipe joins its pipe size and keeps a sleeve flag on its part', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Mark', 'Profile', 'No.', 'Grade', 'Length (mm)'], ['TC-m1', 'PIPE139.8X5', 6, 'HSS550', 8000], ['TC-m7', 'PIPE 139.8X5 SL', 12, 'HSS550', 400]]), 'Parts')
    const r = parsePartList(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    expect(r.sizes.map(s => [s.profile, s.parts])).toEqual([['PIPE 139.8X5', [{ mark: 'TC-m1', lengthMm: 8000, count: 6 }, { mark: 'TC-m7', lengthMm: 400, count: 12, sleeve: true }]]])
    expect(r.warnings).toEqual(['PIPE 139.8X5: sleeve pipes (SL) laid out with it: 1 mark (12 pcs)'])
  })
})
