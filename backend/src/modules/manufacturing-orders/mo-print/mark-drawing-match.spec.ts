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

  it('only searches the latest version, never an older revision that happens to match', () => {
    const older = drawing({ file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1 })
    const newer = drawing({ file_name: 'DBN-A1-STR1 - - Rev 1.pdf', version: 2 })
    expect(findLatestPdfForMark([older, newer], 'DBN-A1-CTR1')).toBeNull()
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
