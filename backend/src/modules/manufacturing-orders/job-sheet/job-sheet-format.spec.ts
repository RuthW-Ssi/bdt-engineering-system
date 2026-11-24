import {
  countSheets, expandPieces, fitText, fmtJobSheetDate, fmtKg, fmtMm, formatHoleSummary, formatJobSheetTitle,
  parseHoleGroups, parseIdList, parseJobSheetMode, parseMarkList, parseOptionalId, parsePlateProfile, pieceId, totalHoles,
} from './job-sheet-format'

// Per-piece job sheet — pure rules. Not yet run under Jest - run
// `pnpm jest job-sheet` in backend/ and fix any drift before merge.
describe('job-sheet-format', () => {
  describe('query parsing', () => {
    it('mode: only an exact "part" switches off per-piece sheets', () => {
      expect(parseJobSheetMode('part')).toBe('part')
      expect(parseJobSheetMode('piece')).toBe('piece')
      expect(parseJobSheetMode(undefined)).toBe('piece')
      expect(parseJobSheetMode('PART')).toBe('piece')
    })

    it('id list: omitted = no filter, empty = explicitly nothing, junk dropped', () => {
      expect(parseIdList(undefined)).toBeUndefined()
      expect(parseIdList('')).toEqual([])
      expect(parseIdList('1, 2,x,3.5,-4,0')).toEqual([1, 2])
    })

    it('mark list trims and drops blanks', () => {
      expect(parseMarkList(undefined)).toBeUndefined()
      expect(parseMarkList(' P101 ,,P102')).toEqual(['P101', 'P102'])
    })

    it('optional id rejects non-positive / non-integer', () => {
      expect(parseOptionalId('7')).toBe(7)
      expect(parseOptionalId('')).toBeUndefined()
      expect(parseOptionalId('abc')).toBeUndefined()
      expect(parseOptionalId('0')).toBeUndefined()
    })
  })

  describe('parseHoleGroups', () => {
    it('reads the nc-parser shape [{ diameter_mm, count }]', () => {
      expect(parseHoleGroups([{ diameter_mm: 22, count: 4 }, { diameter_mm: 18, count: 2 }])).toEqual([
        { diameter_mm: 18, count: 2 },
        { diameter_mm: 22, count: 4 },
      ])
    })

    it('folds the canonical part JSON shape [{ type, cx, cy, d }] into groups', () => {
      const holes = [{ type: 'round', cx: 0, cy: 0, d: 22 }, { type: 'round', cx: 50, cy: 0, d: 22 }, { type: 'round', cx: 0, cy: 50, d: 14 }]
      expect(parseHoleGroups(holes)).toEqual([{ diameter_mm: 14, count: 1 }, { diameter_mm: 22, count: 2 }])
    })

    it('ignores anything that is not a hole list', () => {
      expect(parseHoleGroups(null)).toEqual([])
      expect(parseHoleGroups('4x22')).toEqual([])
      expect(parseHoleGroups([{ diameter_mm: 0, count: 3 }, { count: 2 }, null, 'x'])).toEqual([])
    })

    it('totals and prints the summary in ASCII', () => {
      const groups = parseHoleGroups([{ diameter_mm: 22, count: 4 }, { diameter_mm: 17.5, count: 2 }])
      expect(totalHoles(groups)).toBe(6)
      expect(formatHoleSummary(groups)).toBe('2 x D17.5, 4 x D22')
      expect(formatHoleSummary([])).toBe('')
    })
  })

  describe('piece expansion', () => {
    it('piece mode prints one sheet per physical piece', () => {
      expect(expandPieces(3, 'piece')).toEqual([
        { pieceNo: 1, pieceTotal: 3 }, { pieceNo: 2, pieceTotal: 3 }, { pieceNo: 3, pieceTotal: 3 },
      ])
    })

    it('part mode prints one sheet carrying the quantity', () => {
      expect(expandPieces(12, 'part')).toEqual([{ pieceNo: null, pieceTotal: 12 }])
    })

    it('bad quantities still print one sheet (a part never disappears)', () => {
      expect(expandPieces(0, 'piece')).toHaveLength(1)
      expect(expandPieces(Number.NaN, 'piece')).toHaveLength(1)
      expect(expandPieces(-2, 'part')).toEqual([{ pieceNo: null, pieceTotal: 1 }])
    })

    it('countSheets agrees with expandPieces', () => {
      const qtys = [3, 1, 0, 12]
      expect(countSheets(qtys, 'piece')).toBe(qtys.reduce((s, q) => s + expandPieces(q, 'piece').length, 0))
      expect(countSheets(qtys, 'part')).toBe(4)
    })
  })

  describe('identity + formatting', () => {
    it('pieceId zero-pads the piece number to the total', () => {
      expect(pieceId('MO-00003', 'A12', 'P101', 3, 12)).toBe('MO-00003/A12/P101/03-12')
      expect(pieceId('MO-00003', 'A12', 'P101', 7, 120)).toBe('MO-00003/A12/P101/007-120')
      expect(pieceId('MO-00003', 'A12', 'P101', null, 12)).toBe('MO-00003/A12/P101/x12')
    })

    it('title carries the MO code and a Bangkok timestamp', () => {
      // 2026-11-23 15:04:05 UTC = 22:04:05 Asia/Bangkok
      expect(formatJobSheetTitle('MO-00003', new Date('2026-11-23T15:04:05Z'))).toBe('JOBSHEET-MO-00003-20261123-220405')
    })

    it('dates print dd/mm/yyyy in Asia/Bangkok, blank when missing', () => {
      expect(fmtJobSheetDate(new Date('2026-11-23T18:00:00Z'))).toBe('24/11/2026')
      expect(fmtJobSheetDate(null)).toBe('')
      expect(fmtJobSheetDate('not a date')).toBe('')
    })

    it('mm / kg helpers print blank for missing values', () => {
      expect(fmtMm(6000)).toBe('6000 mm')
      expect(fmtMm(1250.5)).toBe('1250.5 mm')
      expect(fmtMm(null)).toBe('')
      expect(fmtKg(12.3456)).toBe('12.35 kg')
      expect(fmtKg(undefined)).toBe('')
    })

    it('plate profile: thickness then width, only for PL / FB', () => {
      expect(parsePlateProfile('PL12')).toEqual({ thickness_mm: 12, width_mm: null })
      expect(parsePlateProfile('PL12x200')).toEqual({ thickness_mm: 12, width_mm: 200 })
      expect(parsePlateProfile('FB 9 x 75')).toEqual({ thickness_mm: 9, width_mm: 75 })
      expect(parsePlateProfile('H300x150x6.5x9')).toEqual({ thickness_mm: null, width_mm: null })
      expect(parsePlateProfile(null)).toEqual({ thickness_mm: null, width_mm: null })
    })

    it('fitText shrinks first, then truncates with "..."', () => {
      const measure = (t: string, s: number) => t.length * s // 1 em per char
      expect(fitText('ABCD', 100, 10, 6, measure)).toEqual({ text: 'ABCD', size: 10 })
      expect(fitText('ABCDEFGHIJ', 80, 10, 6, measure)).toEqual({ text: 'ABCDEFGHIJ', size: 8 })
      const cut = fitText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 60, 10, 6, measure)
      expect(cut.size).toBe(6)
      expect(cut.text.endsWith('...')).toBe(true)
      expect(measure(cut.text, cut.size)).toBeLessThanOrEqual(60)
    })
  })
})
