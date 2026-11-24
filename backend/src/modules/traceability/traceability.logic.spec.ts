import {
  computeCompleteness, csvCell, inScope, latestSheetIds, mainFlagOfSlots, markKey, normalizeHeatNo, normalizeMill,
  parentPlateName, toCsv, traceCsvRows, TRACE_CSV_HEADER,
} from './traceability.logic'
import type { TraceRow } from './traceability.logic'

const HEAT = { plate_cut_id: 1, heat_lot_id: 1, heat_no: 'H12345', mill: 'MILL A', cert_no: 'MTC-1', plate_no: 'PLT-001', plate_seq: 1, cut_date: '2026-11-23' }

function row(over: Partial<TraceRow> = {}): TraceRow {
  return {
    order_part_id: 1, upload_id: 1, nesting_id: 10, sheet: 'X-1', nc_file: '0001.cld', report_plate_number: null, quality: 'SS400', thick_mm: 12,
    part_mark: 'A-p1', project_code: 'P001', qty: 2, weight_kg: 10, is_main_part: true, bom_part_id: null, traced: false, heats: [], ...over,
  }
}

describe('traceability.logic', () => {
  describe('normalizers', () => {
    it('stores a heat number without blanks, upper-case', () => {
      expect(normalizeHeatNo(' h 12345a ')).toBe('H12345A')
      expect(normalizeHeatNo(null)).toBe('')
    })
    it('keeps a mill name with single blanks', () => {
      expect(normalizeMill('  Mill   A ')).toBe('Mill A')
      expect(normalizeMill(undefined)).toBe('')
    })
    it('joins marks the same way as the BOM matching (trim + lower)', () => {
      expect(markKey('A-p11 ')).toBe('a-p11')
    })
  })

  describe('mainFlagOfSlots', () => {
    it('MAIN wins over ACC, ACC over unknown', () => {
      expect(mainFlagOfSlots(['ACC', 'MAIN'])).toBe(true)
      expect(mainFlagOfSlots(['ACC', null])).toBe(false)
      expect(mainFlagOfSlots([null])).toBeNull()
      expect(mainFlagOfSlots([])).toBeNull()
    })
  })

  describe('latestSheetIds', () => {
    it('keeps only the newest upload of each NC file', () => {
      const ids = latestSheetIds([
        { id: 1, upload_id: 1, nc_file: '0001.cld', cuttingplan_number: 'X-1' },
        { id: 2, upload_id: 3, nc_file: '0001.CLD', cuttingplan_number: 'X-1' },
        { id: 3, upload_id: 2, nc_file: '0002.cld', cuttingplan_number: 'X-2' },
      ])
      expect([...ids].sort()).toEqual([2, 3])
    })
    it('treats a sheet without an NC file as its own version', () => {
      const ids = latestSheetIds([
        { id: 1, upload_id: 1, nc_file: null, cuttingplan_number: 'X-1' },
        { id: 2, upload_id: 2, nc_file: null, cuttingplan_number: 'X-1' },
      ])
      expect(ids.size).toBe(2)
    })
  })

  describe('inScope', () => {
    it('main_or_unknown leaves out only accessories', () => {
      expect(inScope({ is_main_part: null }, 'main_or_unknown')).toBe(true)
      expect(inScope({ is_main_part: false }, 'main_or_unknown')).toBe(false)
      expect(inScope({ is_main_part: null }, 'main')).toBe(false)
      expect(inScope({ is_main_part: false }, 'all')).toBe(true)
    })
  })

  describe('computeCompleteness', () => {
    const rows = [
      row({ order_part_id: 1, traced: true, heats: [HEAT], qty: 2, weight_kg: 10 }),
      row({ order_part_id: 2, traced: false, qty: 6, weight_kg: 30, nesting_id: 11, sheet: 'X-2' }),
      row({ order_part_id: 3, traced: true, heats: [HEAT], is_main_part: false, qty: 100, weight_kg: 5 }),
      row({ order_part_id: 4, traced: false, is_main_part: null, qty: 2, weight_kg: 10, nesting_id: 11, sheet: 'X-2' }),
    ]
    it('counts main parts only for scope main', () => {
      const c = computeCompleteness(rows, 'main')
      expect(c.parts_total).toBe(2)
      expect(c.parts_traced).toBe(1)
      expect(c.pct_parts).toBe(50)
      expect(c.pct_qty).toBe(25)
      expect(c.pct_weight).toBe(25)
      expect(c.main_unknown).toBe(1)
    })
    it('counts unknown parts as needing a heat number by default', () => {
      const c = computeCompleteness(rows, 'main_or_unknown')
      expect(c.parts_total).toBe(3)
      expect(c.parts_untraced).toBe(2)
      expect(c.pct_parts).toBe(33.3)
      expect(c.sheets_total).toBe(2)
      expect(c.sheets_traced).toBe(1)
    })
    it('gives null percentages when there is nothing to trace', () => {
      const c = computeCompleteness([], 'all')
      expect(c.pct_parts).toBeNull()
      expect(c.pct_qty).toBeNull()
      expect(c.pct_weight).toBeNull()
    })
  })

  describe('csv', () => {
    it('quotes commas and quotes, and neutralises formula starts', () => {
      expect(csvCell('a,b')).toBe('"a,b"')
      expect(csvCell('say "hi"')).toBe('"say ""hi"""')
      expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
      expect(csvCell(-5)).toBe('-5')
      expect(csvCell(null)).toBe('')
      expect(csvCell(true)).toBe('Y')
    })
    it('writes a BOM, CRLF and one line per part × plate', () => {
      const lines = traceCsvRows([row({ traced: true, heats: [HEAT, { ...HEAT, plate_cut_id: 2, plate_seq: 2 }] }), row({ order_part_id: 2 })])
      expect(lines).toHaveLength(3)
      expect(lines[2].slice(-6)).toEqual([null, null, null, null, null, null])
      const csv = toCsv(TRACE_CSV_HEADER, lines)
      expect(csv.startsWith('﻿project_code,part_mark,')).toBe(true)
      expect(csv.split('\r\n')).toHaveLength(5) // header + 3 lines + the empty tail
      expect(lines.every(l => l.length === TRACE_CSV_HEADER.length)).toBe(true)
    })
  })

  describe('parentPlateName', () => {
    it('is null when the Charge is the sheet itself, even when the report wrapped the name', () => {
      expect(parentPlateName('0P903-Z1-10-1 0', '0P903-Z1-10-10')).toBeNull()
      expect(parentPlateName(null, 'X-1')).toBeNull()
      expect(parentPlateName('  ', 'X-1')).toBeNull()
    })

    it('names the other plate when the Charge differs (sheet re-nested from a remnant)', () => {
      expect(parentPlateName(' 901-Z0-10-3 ', '901-Z0-10-3-1REVISE2')).toBe('901-Z0-10-3')
    })
  })
})
