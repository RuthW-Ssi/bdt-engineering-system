import type { Drawing } from '../../api/drawings'
import { findLatestPdfForMark } from './WoVisualTab'

function makePdf(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, version: 1,
    file_key: 'k', file_name: 'DBN-B1-CTR10 - - Rev 1.pdf', mime_type: null, uploaded_by_id: 1,
    create_date: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('findLatestPdfForMark', () => {
  it('matches a drawing whose filename leads with the mark, ignoring the trailing "- - Rev N" suffix', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR10')?.id).toBe(1)
  })

  it('is case-insensitive', () => {
    const drawings = [makePdf({ id: 1, file_name: 'dbn-b1-ctr10 - - Rev 1.pdf' })]
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR10')?.id).toBe(1)
  })

  it('does not partial-match a different mark that merely shares a prefix (CTR1 vs CTR10)', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR1')).toBeNull()
  })

  // .dwg has no in-page preview since the Autodesk APS pipeline's
  // 2026-09-15 removal — matching one here would only ever feed
  // DrawingPreviewPanel a file it can't render.
  it('ignores DWG files even when the filename matches the mark', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.dwg' })]
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR10')).toBeNull()
  })

  it('only searches the latest .pdf version — an older version with a matching mark is ignored', () => {
    const drawings = [
      makePdf({ id: 1, version: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' }),
      makePdf({ id: 2, version: 2, file_name: 'DBN-B1-CTR11 - - Rev 1.pdf' }),
    ]
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR10')).toBeNull()
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR11')?.id).toBe(2)
  })

  it('returns null when no .pdf in the latest version matches the mark', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR99 - - Rev 1.pdf' })]
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR10')).toBeNull()
  })

  it('picks the most recently uploaded file when more than one match lands in the latest version', () => {
    const drawings = [
      makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf', create_date: '2026-01-01T00:00:00Z' }),
      makePdf({ id: 2, file_name: 'DBN-B1-CTR10 - - Rev 2.pdf', create_date: '2026-01-02T00:00:00Z' }),
    ]
    expect(findLatestPdfForMark(drawings, 'DBN-B1-CTR10')?.id).toBe(2)
  })
})
