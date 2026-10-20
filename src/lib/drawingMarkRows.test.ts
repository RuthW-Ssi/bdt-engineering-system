import type { Drawing } from '../api/drawings'
import { buildMarkRows } from './drawingMarkRows'

function makeDrawing(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 1, sub_zone_id: null,
    mark: 'A', rev: 1, version: 1,
    file_key: 'k', file_name: 'A - BEAM - Rev 1.pdf', mime_type: 'application/pdf',
    uploaded_by_id: 1, create_date: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildMarkRows', () => {
  it('groups drawings by mark', () => {
    const drawings = [
      makeDrawing({ id: 1, mark: 'A', rev: 1, file_name: 'A - BEAM - Rev 1.pdf' }),
      makeDrawing({ id: 2, mark: 'B', rev: 1, file_name: 'B - BEAM - Rev 1.pdf' }),
    ]
    const rows = buildMarkRows(drawings)
    expect(rows.map(r => r.mark)).toEqual(['A', 'B'])
  })

  it('orders revs highest first within a mark', () => {
    const drawings = [
      makeDrawing({ id: 1, mark: 'A', rev: 1, file_name: 'A - BEAM - Rev 1.pdf', create_date: '2026-01-01T00:00:00.000Z' }),
      makeDrawing({ id: 2, mark: 'A', rev: 2, file_name: 'A - BEAM - Rev 2.pdf', create_date: '2026-01-02T00:00:00.000Z' }),
      makeDrawing({ id: 3, mark: 'A', rev: 0, file_name: 'A - BEAM - Rev .pdf', create_date: '2025-12-30T00:00:00.000Z' }),
    ]
    const rows = buildMarkRows(drawings)
    expect(rows[0].revs.map(r => r.rev)).toEqual([2, 1, 0])
  })

  it('a rev with several sheets lists files newest first, uploadedAt = newest create_date in that rev', () => {
    const drawings = [
      makeDrawing({ id: 1, mark: 'A', rev: 1, file_name: 'A - BEAM - Rev 1.pdf', create_date: '2026-01-01T00:00:00.000Z' }),
      makeDrawing({ id: 2, mark: 'A', rev: 1, file_name: 'A - PLAN - Rev 1.pdf', create_date: '2026-01-03T00:00:00.000Z' }),
      makeDrawing({ id: 3, mark: 'A', rev: 1, file_name: 'A - ELEV - Rev 1.pdf', create_date: '2026-01-02T00:00:00.000Z' }),
    ]
    const rows = buildMarkRows(drawings)
    expect(rows[0].revs).toHaveLength(1)
    expect(rows[0].revs[0].files.map(f => f.id)).toEqual([2, 3, 1])
    expect(rows[0].revs[0].uploadedAt).toBe('2026-01-03T00:00:00.000Z')
  })

  it('sorts marks with natural ordering, so CTR2 sorts before CTR10', () => {
    const drawings = [
      makeDrawing({ id: 1, mark: 'CTR10', file_name: 'CTR10 - BEAM - Rev 1.pdf' }),
      makeDrawing({ id: 2, mark: 'CTR2', file_name: 'CTR2 - BEAM - Rev 1.pdf' }),
      makeDrawing({ id: 3, mark: 'CTR1', file_name: 'CTR1 - BEAM - Rev 1.pdf' }),
    ]
    const rows = buildMarkRows(drawings)
    expect(rows.map(r => r.mark)).toEqual(['CTR1', 'CTR2', 'CTR10'])
  })

  it('collects null-mark drawings into a single row placed last', () => {
    const drawings = [
      makeDrawing({ id: 1, mark: 'CTR2', file_name: 'CTR2 - BEAM - Rev 1.pdf' }),
      makeDrawing({ id: 2, mark: null, rev: 1, file_name: 'unparsed - Rev 1.pdf' }),
      makeDrawing({ id: 3, mark: null, rev: 2, file_name: 'another - Rev 2.pdf' }),
      makeDrawing({ id: 4, mark: 'CTR1', file_name: 'CTR1 - BEAM - Rev 1.pdf' }),
    ]
    const rows = buildMarkRows(drawings)
    expect(rows.map(r => r.mark)).toEqual(['CTR1', 'CTR2', null])
    expect(rows[2].revs.map(r => r.rev)).toEqual([2, 1])
  })

  it('returns an empty array for no drawings', () => {
    expect(buildMarkRows([])).toEqual([])
  })

  // Phase-1 compatibility: a row can come straight from an old backend
  // response that omits the mark column entirely (undefined, not null) —
  // must fold into the unmarked row rather than crash on .toLowerCase().
  it('does not crash on a row with mark: undefined (old backend response), folding it into the unmarked row', () => {
    const drawings = [
      makeDrawing({ id: 1, mark: 'CTR1', file_name: 'CTR1 - BEAM - Rev 1.pdf' }),
      { ...makeDrawing({ id: 2, file_name: 'unparsed.pdf' }), mark: undefined } as unknown as Drawing,
    ]
    expect(() => buildMarkRows(drawings)).not.toThrow()
    const rows = buildMarkRows(drawings)
    expect(rows.map(r => r.mark)).toEqual(['CTR1', null])
  })

  it('groups marks case-insensitively, like current-rev.spec.ts does for the top rev', () => {
    const drawings = [
      makeDrawing({ id: 1, mark: 'a', rev: 0, file_name: 'a - BEAM - Rev .pdf', create_date: '2026-01-01T00:00:00.000Z' }),
      makeDrawing({ id: 2, mark: 'A', rev: 1, file_name: 'A - BEAM - Rev 1.pdf', create_date: '2026-01-02T00:00:00.000Z' }),
    ]
    const rows = buildMarkRows(drawings)
    expect(rows).toHaveLength(1)
    expect(rows[0].mark).toBe('A') // newest file in the highest rev wins the display casing
    expect(rows[0].revs.map(r => r.rev)).toEqual([1, 0])
  })
})
