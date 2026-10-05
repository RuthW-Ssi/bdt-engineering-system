import { findLatestPdfForMark, type DrawingRow } from './mark-drawing-match'

function drawing(overrides: Partial<DrawingRow>): DrawingRow {
  return {
    file_name: 'CTR1 - - Rev 1.pdf',
    version: 1,
    create_date: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('findLatestPdfForMark', () => {
  it('matches a drawing whose filename leads with the mark', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBe(d)
  })

  it('is case-insensitive', () => {
    const d = drawing({ file_name: 'dbn-a1-ctr1 - - rev 1.pdf', version: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBe(d)
  })

  it('never matches a longer mark that merely starts with the same prefix (CTR1 vs CTR10)', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR10 - - Rev 1.pdf', version: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBeNull()
  })

  it('ignores .dwg files entirely', () => {
    const d = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.dwg', version: 1 })
    expect(findLatestPdfForMark([d], 'DBN-A1-CTR1')).toBeNull()
  })

  // 2026-10-05 (print option A): versions are sparse (one upload = one version
  // holding only that batch's files), so the zone's newest batch skipping this
  // mark must not hide — or block printing of — the mark's own newest drawing.
  it('picks the newest version that actually holds the mark, even when the zone\'s latest batch skipped it', () => {
    const older = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1 })
    const newerOtherMark = drawing({ file_name: 'DBN-A1-STR1 - - Rev 1.pdf', version: 2 })
    expect(findLatestPdfForMark([older, newerOtherMark], 'DBN-A1-CTR1')).toBe(older)
  })

  it('prefers the mark\'s higher version over an older one', () => {
    const v1 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1, create_date: '2026-03-01T00:00:00Z' })
    const v3 = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 2.pdf', version: 3, create_date: '2026-02-01T00:00:00Z' })
    expect(findLatestPdfForMark([v1, v3], 'DBN-A1-CTR1')).toBe(v3)
  })

  it('tie-breaks same-version matches by most recent create_date', () => {
    const earlier = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1, create_date: '2026-01-01T00:00:00Z' })
    const later = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1, create_date: '2026-01-02T00:00:00Z' })
    expect(findLatestPdfForMark([earlier, later], 'DBN-A1-CTR1')).toBe(later)
  })

  it('returns null when there are no drawings at all', () => {
    expect(findLatestPdfForMark([], 'DBN-A1-CTR1')).toBeNull()
  })
})
