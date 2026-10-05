import type { Drawing } from '../api/drawings'
import { listMarkDrawingVersions } from './markDrawingVersions'

function makePdf(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, version: 1,
    file_key: 'k', file_name: 'DBN-B1-CTR10 - - Rev 1.pdf', mime_type: null, uploaded_by_id: 1,
    create_date: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const ids = (versions: ReturnType<typeof listMarkDrawingVersions>) => versions.map(v => [v.version, v.drawing.id])

describe('listMarkDrawingVersions', () => {
  it('matches a drawing whose filename leads with the mark, ignoring the trailing "- - Rev N" suffix', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(ids(listMarkDrawingVersions(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
  })

  it('is case-insensitive', () => {
    const drawings = [makePdf({ id: 1, file_name: 'dbn-b1-ctr10 - - Rev 1.pdf' })]
    expect(ids(listMarkDrawingVersions(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
  })

  it('does not partial-match a different mark that merely shares a prefix (CTR1 vs CTR10)', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(listMarkDrawingVersions(drawings, 'DBN-B1-CTR1')).toEqual([])
  })

  // .dwg has no in-page preview since the Autodesk APS pipeline's
  // 2026-09-15 removal — matching one here would only ever feed
  // DrawingPreviewPanel a file it can't render.
  it('ignores DWG files even when the filename matches the mark', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.dwg' })]
    expect(listMarkDrawingVersions(drawings, 'DBN-B1-CTR10')).toEqual([])
  })

  it('returns an empty list when no .pdf matches the mark', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR99 - - Rev 1.pdf' })]
    expect(listMarkDrawingVersions(drawings, 'DBN-B1-CTR10')).toEqual([])
  })

  it('lists every version that contains the mark, newest first', () => {
    const drawings = [
      makePdf({ id: 1, version: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' }),
      makePdf({ id: 3, version: 3, file_name: 'DBN-B1-CTR10 - - Rev 2.pdf' }),
      makePdf({ id: 2, version: 2, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' }),
    ]
    expect(ids(listMarkDrawingVersions(drawings, 'DBN-B1-CTR10'))).toEqual([[3, 3], [2, 2], [1, 1]])
  })

  // Versions are sparse (one upload action = one version holding only that
  // batch's files) — a newer batch that skipped this mark must not hide the
  // mark's own older drawing.
  it('skips versions that do not contain the mark, so its older drawing is still found', () => {
    const drawings = [
      makePdf({ id: 1, version: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' }),
      makePdf({ id: 2, version: 2, file_name: 'DBN-B1-CTR11 - - Rev 1.pdf' }),
    ]
    expect(ids(listMarkDrawingVersions(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
    expect(ids(listMarkDrawingVersions(drawings, 'DBN-B1-CTR11'))).toEqual([[2, 2]])
  })

  it('keeps the most recently uploaded file when one version has several matches for the mark', () => {
    const drawings = [
      makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf', create_date: '2026-01-01T00:00:00Z' }),
      makePdf({ id: 2, file_name: 'DBN-B1-CTR10 - - Rev 2.pdf', create_date: '2026-01-02T00:00:00Z' }),
    ]
    expect(ids(listMarkDrawingVersions(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 2]])
  })
})
