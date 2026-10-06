import * as XLSX from 'xlsx'
import { BadRequestException } from '@nestjs/common'
import { parseDispatchNote } from './dispatch-note-parser'

function book(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer
}
const HEAD = ['No.', 'Mark No.', 'Name', 'Drawing Number', 'Set', 'Rev', 'WeightKg.', 'Paint', 'LENGTH', 'WIDTH', 'HIGTH', 'TYPE PAINT']
const CELESTICA = book({
  Dispatch: [
    ['Dispatch Note _CELESTICA PHASE 3 ZONE 1(BUILD UP)', '', '', '', '', '', '', '', '', '', '', '14/9/2026'],
    [],
    HEAD,
    [0, 1, 2, 3, 4, 5, '', 'Area'],
    [1, 'BUH1-3', 'WEB', 'BUH1-3', 2, 0, 7122.3, 85.416, 10550, 400, 1200],
    [2, 'BUH1A-12', 'WEB', 'BUH1A-12', 1, 0, 3229.88, 38.48, 10550, 400, 1000],
    [],
    [10, '', '', '', '', '', 34397.25, 407.459],
  ],
  FINAL: [['NO.', 'Ass Mk', "Q'TY"], [1, 'BXA1', 4]],
})

describe('parseDispatchNote', () => {
  it('reads marks from the first sheet only, skipping the index row and the total row', () => {
    const r = parseDispatchNote(CELESTICA)
    expect(r.marks).toEqual([
      { mark: 'BUH1-3', set_qty: 2, length_mm: 10550, width_mm: 400, height_mm: 1200, weight_kg: 7122.3 },
      { mark: 'BUH1A-12', set_qty: 1, length_mm: 10550, width_mm: 400, height_mm: 1000, weight_kg: 3229.88 },
    ])
    expect(r.warnings).toEqual([])
  })
  it('warns on a mark with no positive Set and skips it', () => {
    const r = parseDispatchNote(book({ Dispatch: [HEAD, [1, 'X-1', 'WEB', 'X-1', '', 0, 1, 1, 100, 100, 100]] }))
    expect(r.marks).toEqual([])
    expect(r.warnings).toEqual(['X-1: missing or invalid Set — skipped'])
  })
  it('rejects a file with no Mark No. column', () => {
    expect(() => parseDispatchNote(book({ S: [['Profile', 'Grade', 'Qty'], ['PL25x400', 'SM520', 4]] })))
      .toThrow(new BadRequestException('Dispatch Note: cannot find Mark No. column'))
  })
})
