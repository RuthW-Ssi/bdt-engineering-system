import { currentRevRows } from './current-rev'

describe('currentRevRows', () => {
  it('keeps every row at each mark\'s highest rev; null-mark rows pass through as-is', () => {
    const rows = [
      { id: 1, mark: 'A', rev: 0 },
      { id: 2, mark: 'A', rev: 1 },
      { id: 3, mark: 'A', rev: 1 },
      { id: 4, mark: 'B', rev: 2 },
      { id: 5, mark: null, rev: null },
    ]

    const result = currentRevRows(rows)

    expect(result).toEqual([rows[1], rows[2], rows[3], rows[4]])
  })

  it('falls back to the previous rev once the top rev\'s rows are deleted from the input', () => {
    // Simulates deleting A's two rev-1 rows: only A's rev-0 row remains in the
    // input, so it is now A's current (highest) rev — no extra write needed.
    const rows = [
      { id: 1, mark: 'A', rev: 0 },
      { id: 4, mark: 'B', rev: 2 },
    ]

    const result = currentRevRows(rows)

    expect(result).toEqual([rows[0], rows[1]])
  })

  it('groups marks case-insensitively when computing the top rev', () => {
    const rows = [
      { id: 1, mark: 'a', rev: 0 },
      { id: 2, mark: 'A', rev: 1 },
    ]

    const result = currentRevRows(rows)

    expect(result).toEqual([rows[1]])
  })
})
