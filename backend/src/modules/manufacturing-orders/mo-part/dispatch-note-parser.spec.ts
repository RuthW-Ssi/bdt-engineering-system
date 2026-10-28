import * as XLSX from 'xlsx'
import { BadRequestException } from '@nestjs/common'
import { parseDispatchNote, parseDispatchNoteRevs } from './dispatch-note-parser'

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
    [1, 'BUH1-3', '        WEB        ', 'BUH1-3', 2, 0, 7122.3, 85.416, 10550, 400, 1200],
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
      { mark: 'BUH1-3', name: 'WEB', set_qty: 2, length_mm: 10550, width_mm: 400, height_mm: 1200, weight_kg: 7122.3, area_m2: 85.416 },
      { mark: 'BUH1A-12', name: 'WEB', set_qty: 1, length_mm: 10550, width_mm: 400, height_mm: 1000, weight_kg: 3229.88, area_m2: 38.48 },
    ])
    expect(r.warnings).toEqual([])
  })
  it('accepts headers written without spaces (Bangna: MarkNo., WeightKg., DrawingNumber)', () => {
    const head = ['No.', 'MarkNo.', 'Name', 'DrawingNumber', 'Set', 'Rev', '', '', '', '', '', 'WeightKg.', 'Paint', 'LENGTH', 'WIDTH', 'HIGTH', 'TYPEPAINT', 'STATUS']
    const r = parseDispatchNote(book({ Dispatch: [head, ['', '', '', '', '', 0, 1, 2, 3, 4, 5, '', 'Area'], [1, 'DBN-B1-BR1', 'BRACE', 'DBN-B1-BR1', 18, 0, 1, 2, '', '', '', 104.44, 3.276, 650, 61, 100]] }))
    expect(r.marks).toEqual([{ mark: 'DBN-B1-BR1', name: 'BRACE', set_qty: 18, length_mm: 650, width_mm: 61, height_mm: 100, weight_kg: 104.44, area_m2: 3.276 }])
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

describe('parseDispatchNoteRevs', () => {
  // Bangna layout (2026-10-26, real file "ZONE 1 Dispatch Note Rev.2.xls"):
  // Rev header at col 5, sub-columns 0..5 in cols 5–10, STATUS at col 17.
  const BANGNA_HEAD = ['No.', 'MarkNo.', 'Name', 'DrawingNumber', 'Set', 'Rev', '', '', '', '', '', 'WeightKg.', 'Paint', 'LENGTH', 'WIDTH', 'HIGTH', 'TYPEPAINT', 'STATUS']
  const IDX = ['', '', '', '', '', 0, 1, 2, 3, 4, 5, '', 'Area', '', '', '', '', '']
  const row = (no: number, mark: string, revs: unknown[], status = '') =>
    [no, mark, 'BRACE', mark, 1, ...revs, ...Array(6 - revs.length).fill(''), 21.2, 0.85, 2008, 114, 150, '', status]
  const BANGNA = book({ Dispatch: [
    ['DRIVING RANGE BANGNA ZONE 1 (NP) Dispatch Note Rev.2'], [],
    BANGNA_HEAD, IDX,
    row(1, 'DBN-B1-BR1', [0, 1, 2]),
    row(2, 'DBN-B1-BR3', [0, 1, 2, 3]),
    row(3, 'DBN-B1-CTR1', [0, 1]),
    row(4, 'DBN-B5-CTR10', [0, 1], 'changed'),
    row(5, 'DBN-X', ['', 'A', '']),
    [],
    ['', '', '', '', '', '', '', '', '', '', '', 244517],
  ] })

  it('takes the HIGHEST number across every Rev sub-column (not the first one, which is always 0)', () => {
    const r = parseDispatchNoteRevs(BANGNA)
    const rev = Object.fromEntries(r.marks.map(m => [m.mark, m.rev]))
    expect(rev['DBN-B1-BR1']).toBe(2)
    expect(rev['DBN-B1-BR3']).toBe(3)
    expect(rev['DBN-B1-CTR1']).toBe(1)
  })

  it('reads STATUS as plain text (info only) and null when empty', () => {
    const r = parseDispatchNoteRevs(BANGNA)
    expect(r.marks.find(m => m.mark === 'DBN-B5-CTR10')!.status).toBe('changed')
    expect(r.marks.find(m => m.mark === 'DBN-B1-BR1')!.status).toBeNull()
  })

  it('a mark with no number in its Rev cells gets rev null; index and total rows are skipped', () => {
    const r = parseDispatchNoteRevs(BANGNA)
    expect(r.marks.find(m => m.mark === 'DBN-X')!.rev).toBeNull()
    expect(r.marks.map(m => m.mark)).toEqual(['DBN-B1-BR1', 'DBN-B1-BR3', 'DBN-B1-CTR1', 'DBN-B5-CTR10', 'DBN-X'])
  })

  it('a single Rev column right before WeightKg. (Celestica layout) reads just that column', () => {
    const head = ['No.', 'Mark No.', 'Name', 'Drawing Number', 'Set', 'Rev', 'WeightKg.', 'Paint', 'LENGTH', 'WIDTH', 'HIGTH']
    const r = parseDispatchNoteRevs(book({ D: [head, [1, 'BUH1-3', 'WEB', 'BUH1-3', 2, 4, 7122.3, 85.4, 10550, 400, 1200]] }))
    expect(r.marks).toEqual([{ mark: 'BUH1-3', rev: 4, status: null }])
  })

  it('a rev above 999 is not used (rev null + warning); STATUS is cut to the 30-char column + warning (security M-1, 2026-10-28)', () => {
    const r = parseDispatchNoteRevs(book({ D: [BANGNA_HEAD, IDX, row(1, 'A1', [0, 1000]), row(2, 'A2', [0, 1e12]), row(3, 'A3', [0, 2], 'x'.repeat(40))] }))
    expect(r.marks).toEqual([{ mark: 'A1', rev: null, status: null }, { mark: 'A2', rev: null, status: null }, { mark: 'A3', rev: 2, status: 'x'.repeat(30) }])
    expect(r.warnings).toEqual([
      'A1: rev 1000 เกิน 999 — ไม่ใช้ rev จาก Dispatch Note',
      'A2: rev 1000000000000 เกิน 999 — ไม่ใช้ rev จาก Dispatch Note',
      'A3: STATUS ยาวเกิน 30 ตัวอักษร — ตัดเหลือ 30',
    ])
  })

  it('no Rev column → every rev null + a warning; a duplicated mark keeps the first row + a warning', () => {
    const r = parseDispatchNoteRevs(book({ D: [['Mark No.', 'Set'], ['A1', 1], ['A1', 2]] }))
    expect(r.marks).toEqual([{ mark: 'A1', rev: null, status: null }])
    expect(r.warnings).toEqual([
      'A1: อยู่ใน Dispatch Note มากกว่า 1 แถว — ใช้แถวแรก',
      'Dispatch Note: ไม่พบคอลัมน์ Rev — อ่าน rev ไม่ได้',
    ])
  })
})
