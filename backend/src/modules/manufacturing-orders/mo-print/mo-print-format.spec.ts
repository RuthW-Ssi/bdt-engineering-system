import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib'
import { capList, drawingPageStamps, drawingRevLabel, markCell, moCodeCell, printedDrawingRevs, renamesForRev, sourceLabelOf, fitTableRows, fitTextSize, formatPlanDateTime, formatPrintPacketTitle, formatShortDate, formatWoCodes, fmt2, summarizeOperations } from './mo-print-format'
import { PRINT_LABELS } from './mo-print-labels'

describe('fmt2', () => {
  it('pads a whole number to 2 decimal places', () => {
    expect(fmt2(30)).toBe('30.00')
  })

  it('rounds a longer decimal to 2 places', () => {
    expect(fmt2(29.947)).toBe('29.95')
  })

  it('keeps an already-2-decimal value unchanged', () => {
    expect(fmt2(11.23)).toBe('11.23')
  })

  it('formats zero', () => {
    expect(fmt2(0)).toBe('0.00')
  })
})

// Feeds the PDF's own /Title metadata (mo-print-pdf-builder.ts calls
// doc.setTitle(...) with this) — the packet is opened via a blob: URL in a
// new browser tab (MoDetail.tsx's handlePrint), not downloaded directly, so
// a Content-Disposition header has no effect on the filename a user's
// browser suggests when they hit Save; the PDF's embedded Title is what
// browsers' native PDF viewers actually use for that (2026-09-16).
describe('formatPrintPacketTitle', () => {
  it('joins the MO code and a zero-padded YYYYMMDD-HHmmss timestamp', () => {
    const now = new Date(2026, 8, 16, 9, 5, 3) // month is 0-indexed: September
    expect(formatPrintPacketTitle('MO-00003', now)).toBe('MO-00003-20260916-090503')
  })

  it('zero-pads single-digit month/day/hour/minute/second', () => {
    const now = new Date(2026, 0, 2, 3, 4, 5)
    expect(formatPrintPacketTitle('MO-00014', now)).toBe('MO-00014-20260102-030405')
  })
})

// Plan Start/Finish on the WO traveler — shop-floor local time, not the
// server's zone (Cloud Run runs in UTC).
describe('formatPlanDateTime', () => {
  it('formats in Asia/Bangkok (UTC+7) as YYYY-MM-DD HH:mm', () => {
    expect(formatPlanDateTime(new Date('2026-09-16T01:30:00Z'))).toBe('2026-09-16 08:30')
  })

  it('rolls over to the next Bangkok day for a late-UTC-evening time', () => {
    expect(formatPlanDateTime(new Date('2026-09-15T20:05:00Z'))).toBe('2026-09-16 03:05')
  })

  it('returns an empty string for an unscheduled WO, leaving the cell blank for hand-fill', () => {
    expect(formatPlanDateTime(null)).toBe('')
  })
})

describe('fitTextSize', () => {
  let font: PDFFont
  beforeAll(async () => {
    font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
  })

  it('keeps the preferred size when the text already fits', () => {
    expect(fitTextSize(font, 'DBN', 200, 10)).toBe(10)
  })

  it('shrinks the size just enough for long text to fit the width', () => {
    const text = 'DBN - Smash golf driving range Bangna'
    const size = fitTextSize(font, text, 120, 10)
    expect(size).toBeLessThan(10)
    expect(font.widthOfTextAtSize(text, size)).toBeCloseTo(120, 5)
  })

  it('never goes below the minimum size', () => {
    expect(fitTextSize(font, 'x'.repeat(500), 50, 10, 6)).toBe(6)
  })
})

// Caps a list to a fixed number of table rows on the one-page WO traveler —
// the last row becomes a "+N more" pointer instead of silently dropping
// the rest.
describe('capList', () => {
  it('returns every item and no hidden count when the list fits', () => {
    expect(capList(['a', 'b'], 3)).toEqual({ shown: ['a', 'b'], hiddenCount: 0 })
  })

  it('returns every item when the list exactly fills the capacity', () => {
    expect(capList(['a', 'b', 'c'], 3)).toEqual({ shown: ['a', 'b', 'c'], hiddenCount: 0 })
  })

  it('gives up the last row to the "+N more" pointer when the list is longer than the capacity', () => {
    expect(capList(['a', 'b', 'c', 'd', 'e'], 3)).toEqual({ shown: ['a', 'b'], hiddenCount: 3 })
  })
})

// Sizes a list table's rows to exactly fill a fixed-height slot on the
// one-page WO traveler (header row included).
describe('fitTableRows', () => {
  it('uses the preferred row height, padding with blank rows, when the list is short', () => {
    // 180pt / 15pt = 12 rows → 11 body rows after the header.
    expect(fitTableRows(180, 3, 15, 11)).toEqual({ capacity: 11, rowHeight: 15 })
  })

  it('stretches rows slightly so the table fills the slot exactly', () => {
    const { capacity, rowHeight } = fitTableRows(170, 3, 15, 11)
    expect(capacity).toBe(10)
    expect(rowHeight * (capacity + 1)).toBeCloseTo(170, 5)
  })

  it('shrinks rows (not below the minimum) to fit a longer list in full', () => {
    const { capacity, rowHeight } = fitTableRows(180, 14, 15, 11)
    expect(capacity).toBe(14)
    expect(rowHeight).toBe(12)
  })

  it('caps capacity at what fits at the minimum row height for a very long list', () => {
    // 180pt / 11pt = 16 rows → 15 body rows.
    expect(fitTableRows(180, 100, 15, 11).capacity).toBe(15)
  })
})

// MO page Routing checklist — one row per routing operation, however many
// WOs that operation currently has (one per mark today).
describe('summarizeOperations', () => {
  it('groups WOs sharing a sequence into one operation row, in sequence order, keeping WO codes in input order', () => {
    const ops = summarizeOperations([
      { sequence: 20, operationLabel: 'OP-WELD — SAW weld', workCenterName: 'Welding', woCode: 'WO-00000081' },
      { sequence: 10, operationLabel: 'OP-CUT — Cutting', workCenterName: 'Cutting', woCode: 'WO-00000079' },
      { sequence: 20, operationLabel: 'OP-WELD — SAW weld', workCenterName: 'Welding', woCode: 'WO-00000082' },
      { sequence: 10, operationLabel: 'OP-CUT — Cutting', workCenterName: 'Cutting', woCode: 'WO-00000080' },
    ])

    expect(ops).toEqual([
      { sequence: 10, operationLabel: 'OP-CUT — Cutting', workCenterName: 'Cutting', woCodes: ['WO-00000079', 'WO-00000080'] },
      { sequence: 20, operationLabel: 'OP-WELD — SAW weld', workCenterName: 'Welding', woCodes: ['WO-00000081', 'WO-00000082'] },
    ])
  })

  it('returns an empty list for no WOs', () => {
    expect(summarizeOperations([])).toEqual([])
  })
})

describe('formatWoCodes', () => {
  it('shows a lone WO code as-is', () => {
    expect(formatWoCodes(['WO-00000079'])).toBe('WO-00000079')
  })

  it('shows the first code plus how many more for several WOs', () => {
    expect(formatWoCodes(['WO-00000079', 'WO-00000080', 'WO-00000081'])).toBe('WO-00000079 +2')
  })

  it('shows a dash for none', () => {
    expect(formatWoCodes([])).toBe('—')
  })
})

// 2026-10-05 (print option A): the drawing's rev + upload date print on
// the drawing page.
describe('formatShortDate', () => {
  it('formats dd/mm/yy in shop-floor time (Asia/Bangkok), not the server\'s UTC', () => {
    expect(formatShortDate(new Date('2026-10-01T18:30:00Z'))).toBe('02/10/26')
    expect(formatShortDate('2026-09-16T01:30:00Z')).toBe('16/09/26')
  })
})

// New-system info printed inside the existing cells (2026-10-09, user: keep
// the old form, only show more — "อย่าทำเกินจากของเดิม").
describe('print cells for MO type / Rev / mark source', () => {
  it('MO code carries the Rev', () => {
    expect(moCodeCell('MO-P2600023', 3)).toBe('MO-P2600023 · Rev.3')
    expect(moCodeCell('MO-26000001', 0)).toBe('MO-26000001 · Rev.0')
  })
  it('a mark says where its data comes from, and its old name for one Rev after a rename', () => {
    expect(sourceLabelOf({ source: 'PRE_SHOP', revision: 0 })).toBe('Pre-shop')
    expect(sourceLabelOf({ source: 'BOM_UPLOAD', revision: 2 })).toBe('BOM rev 2')
    expect(markCell('BUH1A-14', 'BOM rev 1', null, 'เดิม')).toBe('BUH1A-14 · BOM rev 1')
    expect(markCell('C1-BUH1-3', 'BOM rev 1', 'BUH1-3', 'เดิม')).toBe('C1-BUH1-3 (เดิม BUH1-3) · BOM rev 1')
  })
  it('finds the marks renamed in the change that made the current Rev', () => {
    const reasons = [
      'เทียบกับ BOM จริง (rev 1): C1-BUH1-3 ชื่อ mark BUH1-3 → C1-BUH1-3 · C1-BUH1-3 ผูกกับ BOM จริง · Rev.2 → Rev.3',
      'เพิ่มข้อมูลจาก Dispatch Note: X9 ชื่อ mark X → X9 · Rev.1 → Rev.2',
    ]
    expect(renamesForRev(reasons, 3)).toEqual(new Map([['C1-BUH1-3', 'BUH1-3']]))
    expect(renamesForRev(reasons, 4)).toEqual(new Map())
  })
})

// Per-page drawing stamp text (2026-10-21 fix round 1) — the brief's own
// worked example: a mark with 2 sheets, one a 2-page PDF ([2, 1]) → 3
// printed pages stamped แผ่น 1/3, 2/3, 3/3 (n = total pages, never the
// sheet count; i keeps counting across the sheet boundary, never resets).
describe('drawingPageStamps', () => {
  it('numbers every page across every sheet 1..n (n = total pages, not sheet count), continuing i across sheets', () => {
    const stamps = drawingPageStamps('Rev 2 · 02/10/26', [2, 1], PRINT_LABELS.th)

    expect(stamps).toHaveLength(3)
    for (const s of stamps) expect(s.startsWith('Drawing Rev 2 · 02/10/26')).toBe(true)
    expect(stamps[0].endsWith(' · แผ่น 1/3')).toBe(true)
    expect(stamps[1].endsWith(' · แผ่น 2/3')).toBe(true)
    expect(stamps[2].endsWith(' · แผ่น 3/3')).toBe(true)
  })

  // A wrong implementation that sets n to the sheet count (2, not 3) would
  // print ".../2" on 3 pages — this pins the real total.
  it('would fail if n were the sheet count instead of the total page count', () => {
    const stamps = drawingPageStamps('Rev 2 · 02/10/26', [2, 1], PRINT_LABELS.th)
    expect(stamps.some(s => s.endsWith('/2'))).toBe(false)
  })

  // A wrong implementation that resets i per sheet would repeat "1/3" at
  // the start of the second sheet instead of continuing to "3/3".
  it('would fail if the page index reset per sheet', () => {
    const stamps = drawingPageStamps('Rev 2 · 02/10/26', [2, 1], PRINT_LABELS.th)
    expect(stamps[2].endsWith(' · แผ่น 1/3')).toBe(false)
  })

  it('drops the suffix entirely for a single sheet with a single page (nothing to disambiguate)', () => {
    const stamps = drawingPageStamps('Rev 1 · 14/09/26', [1], PRINT_LABELS.th)
    expect(stamps).toEqual(['Drawing Rev 1 · 14/09/26'])
  })

  it('gives the same stamps in English, with the English sheet word', () => {
    const stamps = drawingPageStamps('Rev 2 · 02/10/26', [2, 1], PRINT_LABELS.en)
    expect(stamps).toEqual([
      'Drawing Rev 2 · 02/10/26 · sheet 1/3',
      'Drawing Rev 2 · 02/10/26 · sheet 2/3',
      'Drawing Rev 2 · 02/10/26 · sheet 3/3',
    ])
  })

  // A 0-page sheet (2026-10-21 fix round 1, point 3) contributes no stamps
  // and must not crash or skew the numbering of the other sheets' pages.
  it('skips a 0-page sheet without crashing, and does not count it toward n', () => {
    const stamps = drawingPageStamps('Rev 1 · 14/09/26', [0, 2], PRINT_LABELS.th)
    expect(stamps).toEqual([
      'Drawing Rev 1 · 14/09/26 · แผ่น 1/2',
      'Drawing Rev 1 · 14/09/26 · แผ่น 2/2',
    ])
  })

  it('returns [] for an all-zero pageCounts (no drawing pages at all)', () => {
    expect(drawingPageStamps('Rev 1 · 14/09/26', [0], PRINT_LABELS.th)).toEqual([])
    expect(drawingPageStamps('Rev 1 · 14/09/26', [], PRINT_LABELS.th)).toEqual([])
  })
})

// mo_print_log.drawing_revs (2026-10-21) — what each printed (WO, mark)
// pair's drawing rev was at print time, so a later-uploaded rev can be
// compared against it (warn-only notice, never a block).
describe('printedDrawingRevs', () => {
  it('maps woId (as a string key) → { assemblyMark → rev }, skipping marks with no drawing', () => {
    const plan = {
      rows: [
        {
          wo: { id: 1398 },
          marks: [
            { assemblyMark: 'DBN-A1-CTR1', drawings: [{ rev: 2 }] },
            { assemblyMark: 'DBN-A1-CTR2', drawings: [] },
          ],
        },
        {
          wo: { id: 1399 },
          marks: [
            { assemblyMark: 'DBN-A1-STR1', drawings: [{ rev: 1 }] },
          ],
        },
      ],
    }

    expect(printedDrawingRevs(plan)).toEqual({
      '1398': { 'DBN-A1-CTR1': 2 },
      '1399': { 'DBN-A1-STR1': 1 },
    })
  })

  // Every sheet of a mark shares its current rev (2026-10-21) — the first
  // one read is representative of them all.
  it('reads the rev from the first of several sheets on one mark', () => {
    const plan = {
      rows: [
        {
          wo: { id: 1398 },
          marks: [{ assemblyMark: 'DBN-A1-CTR1', drawings: [{ rev: 2 }, { rev: 2 }] }],
        },
      ],
    }

    expect(printedDrawingRevs(plan)).toEqual({ '1398': { 'DBN-A1-CTR1': 2 } })
  })

  it('omits a WO entirely when none of its marks has a drawing', () => {
    const plan = {
      rows: [
        { wo: { id: 1398 }, marks: [{ assemblyMark: 'DBN-A1-CTR1', drawings: [] }] },
      ],
    }

    expect(printedDrawingRevs(plan)).toEqual({})
  })

  it('returns {} for a plan with no rows', () => {
    expect(printedDrawingRevs({ rows: [] })).toEqual({})
  })
})

describe('drawingRevLabel', () => {
  it('adds "Drawing ของชื่อเดิม X" inside the existing label only when the drawing came from an old name', () => {
    const d = new Date('2026-10-02T05:00:00Z')
    expect(drawingRevLabel(2, d, null, PRINT_LABELS.th)).toBe(`Rev 2 · ${formatShortDate(d)}`)
    expect(drawingRevLabel(2, d, 'BUH1B-18', PRINT_LABELS.th)).toBe(`Rev 2 · ${formatShortDate(d)} · Drawing ของชื่อเดิม BUH1B-18`)
    expect(drawingRevLabel(2, d, 'BUH1B-18', PRINT_LABELS.en)).toBe(`Rev 2 · ${formatShortDate(d)} · drawing of old name BUH1B-18`)
  })
})
