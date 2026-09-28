import type { Drawing } from '../api/drawings'
import { filterDrawingsByType } from './DrawingList'

function makeDrawing(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, version: 1,
    file_key: 'k', file_name: 'x.dwg', mime_type: null, uploaded_by_id: 1,
    create_date: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('filterDrawingsByType', () => {
  it('keeps only .dwg files when fileType is dwg', () => {
    const drawings = [makeDrawing({ id: 1, file_name: 'a.dwg' }), makeDrawing({ id: 2, file_name: 'b.pdf' })]
    expect(filterDrawingsByType(drawings, 'dwg').map(d => d.id)).toEqual([1])
  })

  it('keeps only .pdf files when fileType is pdf', () => {
    const drawings = [makeDrawing({ id: 1, file_name: 'a.dwg' }), makeDrawing({ id: 2, file_name: 'b.pdf' })]
    expect(filterDrawingsByType(drawings, 'pdf').map(d => d.id)).toEqual([2])
  })

  it('matches case-insensitively', () => {
    const drawings = [makeDrawing({ id: 1, file_name: 'A.PDF' })]
    expect(filterDrawingsByType(drawings, 'pdf').map(d => d.id)).toEqual([1])
  })
})
