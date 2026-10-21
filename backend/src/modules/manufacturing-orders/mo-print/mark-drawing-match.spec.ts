import { currentRevSheetsForMark, type DrawingRow } from './mark-drawing-match'

// mark: null on every fixture here unless a test overrides it — exercises
// the filename fallback (legacy rows that predate the mark/rev backfill).
// Matching via the real d.mark field is pinned separately below.
function drawing(overrides: Partial<DrawingRow>): DrawingRow {
  return {
    file_name: 'CTR1 - - Rev 1.pdf',
    mark: null,
    rev: 1,
    create_date: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('currentRevSheetsForMark', () => {
  it('matches a drawing whose filename leads with the mark', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1 })
    expect(currentRevSheetsForMark([d], 'DBN-A1-CTR1')).toEqual([d])
  })

  it('is case-insensitive', () => {
    const d = drawing({ file_name: 'dbn-a1-ctr1 - - rev 1.pdf', rev: 1 })
    expect(currentRevSheetsForMark([d], 'DBN-A1-CTR1')).toEqual([d])
  })

  it('never matches a longer mark that merely starts with the same prefix (CTR1 vs CTR10)', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR10 - - Rev 1.pdf', rev: 1 })
    expect(currentRevSheetsForMark([d], 'DBN-A1-CTR1')).toEqual([])
  })

  it('ignores .dwg files entirely', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.dwg', rev: 1 })
    expect(currentRevSheetsForMark([d], 'DBN-A1-CTR1')).toEqual([])
  })

  // 2026-10-05 (print option A): revs are sparse (one upload = one rev
  // holding only that batch's files), so the zone's latest batch skipping
  // this mark must not hide — or block printing of — the mark's own newest
  // drawing.
  it('picks the newest rev that actually holds the mark, even when the zone\'s latest batch skipped it', () => {
    const older = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1 })
    const newerOtherMark = drawing({ file_name: 'DBN-A1-STR1 - - Rev 1.pdf', rev: 2 })
    expect(currentRevSheetsForMark([older, newerOtherMark], 'DBN-A1-CTR1')).toEqual([older])
  })

  it('prefers the mark\'s higher rev over an older one', () => {
    const v1 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1, create_date: '2026-03-01T00:00:00Z' })
    const v3 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 2.pdf', rev: 3, create_date: '2026-02-01T00:00:00Z' })
    expect(currentRevSheetsForMark([v1, v3], 'DBN-A1-CTR1')).toEqual([v3])
  })

  it('returns [] when there are no drawings at all', () => {
    expect(currentRevSheetsForMark([], 'DBN-A1-CTR1')).toEqual([])
  })

  // A higher rev always outranks a more recently uploaded lower rev.
  it('a higher rev always outranks a more recently uploaded lower rev', () => {
    const rev2 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 2.pdf', rev: 2, create_date: '2026-01-01T00:00:00Z' })
    const rev1 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1, create_date: '2026-06-01T00:00:00Z' })
    expect(currentRevSheetsForMark([rev2, rev1], 'DBN-A1-CTR1')).toEqual([rev2])
  })

  // The primary match path, now that drawings carry a real mark column —
  // used directly; filename extraction never runs.
  it('matches via the real mark field when present, not just the filename', () => {
    const d = drawing({ mark: 'DBN-A1-CTR1', file_name: 'something totally different.pdf' })
    expect(currentRevSheetsForMark([d], 'DBN-A1-CTR1')).toEqual([d])
  })

  // Legacy rows that predate the mark/rev backfill have mark === null — the
  // only case that still falls back to the filename.
  it('falls back to the filename-derived mark when mark is null', () => {
    const d = drawing({ mark: null, file_name: 'DBN-A1-CTR1 - - Rev 1.pdf' })
    expect(currentRevSheetsForMark([d], 'DBN-A1-CTR1')).toEqual([d])
  })

  // 2026-10-21 (print every sheet of the current rev): a batch upload can
  // hold several sheets of one mark at the same rev — every one must print.
  it('returns every sheet at the current rev, natural-sorted by file_name, excluding older revs', () => {
    const sheet2 = drawing({ mark: 'DBN-A1-CTR1', file_name: 'DBN-A1-CTR1 - sheet 2 - Rev 2.pdf', rev: 2 })
    const sheet10 = drawing({ mark: 'DBN-A1-CTR1', file_name: 'DBN-A1-CTR1 - sheet 10 - Rev 2.pdf', rev: 2 })
    const sheet1 = drawing({ mark: 'DBN-A1-CTR1', file_name: 'DBN-A1-CTR1 - sheet 1 - Rev 2.pdf', rev: 2 })
    const olderRev = drawing({ mark: 'DBN-A1-CTR1', file_name: 'DBN-A1-CTR1 - sheet 1 - Rev 1.pdf', rev: 1 })

    expect(currentRevSheetsForMark([sheet2, sheet10, olderRev, sheet1], 'DBN-A1-CTR1')).toEqual([sheet1, sheet2, sheet10])
  })

  it('is case-insensitive across every sheet of the current rev, not just the first match', () => {
    const a = drawing({ file_name: 'dbn-a1-ctr1 - sheet 1 - rev 2.pdf', rev: 2 })
    const b = drawing({ file_name: 'DBN-A1-CTR1 - Sheet 2 - Rev 2.PDF', rev: 2 })
    expect(currentRevSheetsForMark([a, b], 'DBN-A1-CTR1')).toEqual([a, b])
  })

  // Two file names that differ ONLY by case tie under the { sensitivity:
  // 'base' } compare — the trailing plain-string tie-break must still give
  // a deterministic order, and the same one the frontend twin picks (see
  // markDrawingRevs.test.ts's matching test).
  it('breaks a case-only-different file_name tie deterministically', () => {
    const lower = drawing({ file_name: 'DBN-A1-CTR1 - sheet 1 - Rev 2.pdf', rev: 2 })
    const upper = drawing({ file_name: 'DBN-A1-CTR1 - SHEET 1 - REV 2.PDF', rev: 2 })
    expect(currentRevSheetsForMark([lower, upper], 'DBN-A1-CTR1')).toEqual([upper, lower])
  })
})
