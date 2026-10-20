import { findLatestPdfForMark, type DrawingRow } from './mark-drawing-match'

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

describe('findLatestPdfForMark', () => {
  it('matches a drawing whose filename leads with the mark', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBe(d)
  })

  it('is case-insensitive', () => {
    const d = drawing({ file_name: 'dbn-a1-ctr1 - - rev 1.pdf', rev: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBe(d)
  })

  it('never matches a longer mark that merely starts with the same prefix (CTR1 vs CTR10)', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR10 - - Rev 1.pdf', rev: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBeNull()
  })

  it('ignores .dwg files entirely', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.dwg', rev: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBeNull()
  })

  // 2026-10-05 (print option A): revs are sparse (one upload = one rev
  // holding only that batch's files), so the zone's latest batch skipping
  // this mark must not hide — or block printing of — the mark's own newest
  // drawing.
  it('picks the newest rev that actually holds the mark, even when the zone\'s latest batch skipped it', () => {
    const older = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1 })
    const newerOtherMark = drawing({ file_name: 'DBN-A1-STR1 - - Rev 1.pdf', rev: 2 })
    expect(findLatestPdfForMark([older, newerOtherMark], 'DBN-A1-CTR1')).toBe(older)
  })

  it('prefers the mark\'s higher rev over an older one', () => {
    const v1 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1, create_date: '2026-03-01T00:00:00Z' })
    const v3 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 2.pdf', rev: 3, create_date: '2026-02-01T00:00:00Z' })
    expect(findLatestPdfForMark([v1, v3], 'DBN-A1-CTR1')).toBe(v3)
  })

  it('tie-breaks same-rev matches by most recent create_date', () => {
    const earlier = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1, create_date: '2026-01-01T00:00:00Z' })
    const later = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1, create_date: '2026-01-02T00:00:00Z' })
    expect(findLatestPdfForMark([earlier, later], 'DBN-A1-CTR1')).toBe(later)
  })

  it('returns null when there are no drawings at all', () => {
    expect(findLatestPdfForMark([], 'DBN-A1-CTR1')).toBeNull()
  })

  // Added for Task 7: a higher rev must win even when a lower rev's file
  // happens to have been uploaded more recently.
  it('a higher rev always outranks a more recently uploaded lower rev', () => {
    const rev2 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 2.pdf', rev: 2, create_date: '2026-01-01T00:00:00Z' })
    const rev1 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', rev: 1, create_date: '2026-06-01T00:00:00Z' })
    expect(findLatestPdfForMark([rev2, rev1], 'DBN-A1-CTR1')).toBe(rev2)
  })

  // Added for Task 7: the primary match path, now that drawings carry a
  // real mark column — used directly; filename extraction never runs.
  it('matches via the real mark field when present, not just the filename', () => {
    const d = drawing({ mark: 'DBN-A1-CTR1', file_name: 'something totally different.pdf' })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBe(d)
  })

  // Added for Task 7: legacy rows that predate the mark/rev backfill have
  // mark === null — the only case that still falls back to the filename.
  it('falls back to the filename-derived mark when mark is null', () => {
    const d = drawing({ mark: null, file_name: 'DBN-A1-CTR1 - - Rev 1.pdf' })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBe(d)
  })
})
