import type { Drawing } from '../../api/drawings'
import { findLatestDwgForMark } from './WoVisualTab'

function makeDwg(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, version: 1,
    file_key: 'k', file_name: 'DBN-B1-CTR10 - - Rev 1.dwg', mime_type: null, uploaded_by_id: 1,
    create_date: '2026-01-01T00:00:00Z', aps_urn: null, aps_translation_status: null,
    aps_translation_error: null,
    ...overrides,
  }
}

describe('findLatestDwgForMark', () => {
  it('matches a drawing whose filename leads with the mark, ignoring the trailing "- - Rev N" suffix', () => {
    const drawings = [makeDwg({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.dwg' })]
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR10')?.id).toBe(1)
  })

  it('is case-insensitive', () => {
    const drawings = [makeDwg({ id: 1, file_name: 'dbn-b1-ctr10 - - Rev 1.dwg' })]
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR10')?.id).toBe(1)
  })

  it('does not partial-match a different mark that merely shares a prefix (CTR1 vs CTR10)', () => {
    const drawings = [makeDwg({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.dwg' })]
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR1')).toBeNull()
  })

  it('ignores PDF files even when the filename matches the mark', () => {
    const drawings = [makeDwg({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR10')).toBeNull()
  })

  it('only searches the latest .dwg version — an older version with a matching mark is ignored', () => {
    const drawings = [
      makeDwg({ id: 1, version: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.dwg' }),
      makeDwg({ id: 2, version: 2, file_name: 'DBN-B1-CTR11 - - Rev 1.dwg' }),
    ]
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR10')).toBeNull()
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR11')?.id).toBe(2)
  })

  it('returns null when no .dwg in the latest version matches the mark', () => {
    const drawings = [makeDwg({ id: 1, file_name: 'DBN-B1-CTR99 - - Rev 1.dwg' })]
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR10')).toBeNull()
  })

  it('picks the most recently uploaded file when more than one match lands in the latest version', () => {
    const drawings = [
      makeDwg({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.dwg', create_date: '2026-01-01T00:00:00Z' }),
      makeDwg({ id: 2, file_name: 'DBN-B1-CTR10 - - Rev 2.dwg', create_date: '2026-01-02T00:00:00Z' }),
    ]
    expect(findLatestDwgForMark(drawings, 'DBN-B1-CTR10')?.id).toBe(2)
  })
})
