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
})
