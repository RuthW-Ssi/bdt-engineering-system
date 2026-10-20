import type { Drawing } from '../api/drawings'
import { filterDrawingsByType, formatUploadedAt } from './DrawingList'

function makeDrawing(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, mark: 'A', rev: 1, version: 1,
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

// Per spec: "upload date/time … plus who uploaded them".
describe('formatUploadedAt', () => {
  const iso = '2026-01-02T03:04:00.000Z'
  const dateTime = new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  it('shows just the date/time when no uploader name is given', () => {
    expect(formatUploadedAt(iso)).toBe(dateTime)
  })

  it('appends the uploader name after the date/time when given', () => {
    expect(formatUploadedAt(iso, 'Tao')).toBe(`${dateTime} · Tao`)
  })

  it('omits the name when it is null (e.g. uploader account was removed)', () => {
    expect(formatUploadedAt(iso, null)).toBe(dateTime)
  })

  // Upload BATCH number (reversed "drop version" decision, 2026-10-20) — NOT
  // the drawing revision, which is already shown elsewhere in the row as
  // "Rev n".
  it('appends the version after the uploader name when given', () => {
    expect(formatUploadedAt(iso, 'Tao', 3)).toBe(`${dateTime} · Tao · v3`)
  })

  it('omits the version when it is null (unparsed legacy/live-check row)', () => {
    expect(formatUploadedAt(iso, 'Tao', null)).toBe(`${dateTime} · Tao`)
  })

  it('appends only the version when there is no uploader name', () => {
    expect(formatUploadedAt(iso, null, 3)).toBe(`${dateTime} · v3`)
  })
})
