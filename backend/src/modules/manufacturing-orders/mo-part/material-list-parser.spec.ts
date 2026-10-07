import * as XLSX from 'xlsx'
import { BadRequestException } from '@nestjs/common'
import { parseMaterialList } from './material-list-parser'

function book(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'NWS Material List FOR Ssi')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer
}

const HEADER = ['Profile', 'Grade', 'Qty', 'Length(mm)', 'Net Area(m2) for one', 'Net Area(m2) for all', 'Net Wieght(kg) for one', 'Net Wieght(kg) for all']
const CELESTICA = book([
  [], ['', 'Project Number:', '0X186-1'], ['', 'Project', 'CELESTICA'], [],
  HEADER,
  ['PL20x950', 'SM520', 5, 8550, 16.63, 83.13, 1275.23, 6376.16],
  ['PL20x950', 'SM520', 1, 10550, 20.51, 20.51, 1573.53, 1573.53],
  ['', 'Total', 6, 53300, '', 103.64, '', 7949.69],
  [],
  ['PL25x400', 'SM520', 4, 10550, 8.99, 35.95, 828.17, 3312.7],
  ['Total', '', 4, 42200, '', 35.95, '', 3312.7],
  ['', '', '', '', 'Total', 139.59, '', 11262.39],
])

describe('parseMaterialList', () => {
  it('reads data rows, skips Total and blank rows, reads the project number', () => {
    const r = parseMaterialList(CELESTICA)
    expect(r.project_number).toBe('0X186-1')
    expect(r.lines).toEqual([
      { profile: 'PL20x950', grade: 'SM520', length_mm: 8550, qty: 5, unit_weight_kg: 1275.23 },
      { profile: 'PL20x950', grade: 'SM520', length_mm: 10550, qty: 1, unit_weight_kg: 1573.53 },
      { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 4, unit_weight_kg: 828.17 },
    ])
    expect(r.warnings).toEqual([])
  })

  it('accepts the correct spelling "Weight" too', () => {
    const r = parseMaterialList(book([HEADER.map(h => h.replace('Wieght', 'Weight')), ['PL25x400', 'SM520', 2, 8550, 7.29, 14.58, 671.18, 1342.36]]))
    expect(r.lines[0].unit_weight_kg).toBe(671.18)
    expect(r.project_number).toBeNull()
  })

  it('warns (does not throw) on a data row with a missing qty or length', () => {
    const r = parseMaterialList(book([HEADER, ['PL25x400', 'SM520', '', 8550, 0, 0, 671.18, 0]]))
    expect(r.lines).toEqual([])
    expect(r.warnings).toEqual(['Row 2 (PL25x400): missing or invalid qty/length — skipped'])
  })

  it('rejects a file with no Profile column', () => {
    expect(() => parseMaterialList(book([['Mark No.', 'Name', 'Set'], ['BUH1-3', 'WEB', 2]])))
      .toThrow(new BadRequestException('Material List: cannot find Profile column'))
  })

  it('rejects a Tekla Part List / Assembly Part List (has a mark column)', () => {
    expect(() => parseMaterialList(book([['Assembly Mark', 'Part Mark', 'Profile', 'Grade', 'Qty', 'Length'], ['BUH1-3', 'C-f1', 'PL25x400', 'SM520', 2, 10550]])))
      .toThrow(new BadRequestException('This looks like a Part List (it has a mark column) — use "ดึงจาก Part List (BOM)" instead'))
  })

  it('rejects a file that is not a spreadsheet', () => {
    expect(() => parseMaterialList(Buffer.from('%PDF-1.4 not a sheet')))
      .toThrow(BadRequestException)
  })
})
