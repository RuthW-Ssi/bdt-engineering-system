import type { Drawing } from '../api/drawings'
import { listMarkDrawingRevs } from './markDrawingRevs'

// mark: null on every fixture here unless a test overrides it — exercises
// the filename fallback (legacy rows that predate the mark/rev backfill).
// Matching via the real d.mark field is pinned separately below.
function makePdf(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, mark: null, rev: 1, version: 1,
    file_key: 'k', file_name: 'DBN-B1-CTR10 - - Rev 1.pdf', mime_type: null, uploaded_by_id: 1,
    create_date: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const ids = (revs: ReturnType<typeof listMarkDrawingRevs>) => revs.map(v => [v.rev, v.drawing.id])

describe('listMarkDrawingRevs', () => {
  it('matches a drawing whose filename leads with the mark, ignoring the trailing "- - Rev N" suffix', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
  })

  it('is case-insensitive', () => {
    const drawings = [makePdf({ id: 1, file_name: 'dbn-b1-ctr10 - - Rev 1.pdf' })]
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
  })

  it('does not partial-match a different mark that merely shares a prefix (CTR1 vs CTR10)', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(listMarkDrawingRevs(drawings, 'DBN-B1-CTR1')).toEqual([])
  })

  // .dwg has no in-page preview since the Autodesk APS pipeline's
  // 2026-09-15 removal — matching one here would only ever feed
  // DrawingPreviewPanel a file it can't render.
  it('ignores DWG files even when the filename matches the mark', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.dwg' })]
    expect(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10')).toEqual([])
  })

  it('returns an empty list when no .pdf matches the mark', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR99 - - Rev 1.pdf' })]
    expect(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10')).toEqual([])
  })

  it('lists every rev that contains the mark, newest first', () => {
    const drawings = [
      makePdf({ id: 1, rev: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' }),
      makePdf({ id: 3, rev: 3, file_name: 'DBN-B1-CTR10 - - Rev 2.pdf' }),
      makePdf({ id: 2, rev: 2, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' }),
    ]
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10'))).toEqual([[3, 3], [2, 2], [1, 1]])
  })

  // Revs are sparse (one upload action = one rev holding only that batch's
  // files) — a newer batch that skipped this mark must not hide the mark's
  // own older drawing.
  it('skips revs that do not contain the mark, so its older drawing is still found', () => {
    const drawings = [
      makePdf({ id: 1, rev: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' }),
      makePdf({ id: 2, rev: 2, file_name: 'DBN-B1-CTR11 - - Rev 1.pdf' }),
    ]
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR11'))).toEqual([[2, 2]])
  })

  // Several matches for one rev are sheets of the same drawing (e.g.
  // multiple views of one assembly from a single batch upload), not
  // duplicate re-uploads — every one of them is kept, not just the most
  // recent. Natural-sorted by file_name, same order the backend print uses
  // (mo-print/mark-drawing-match.ts's currentRevSheetsForMark).
  it('keeps every file at a rev as a sheet, natural-sorted by file_name, with drawing = files[0]', () => {
    const drawings = [
      makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - Sheet 10 - Rev 1.pdf', create_date: '2026-01-02T00:00:00Z' }),
      makePdf({ id: 2, file_name: 'DBN-B1-CTR10 - Sheet 2 - Rev 1.pdf', create_date: '2026-01-01T00:00:00Z' }),
    ]
    const [entry] = listMarkDrawingRevs(drawings, 'DBN-B1-CTR10')
    // "Sheet 2" sorts before "Sheet 10" — numeric-aware, not lexicographic
    // (which would put "10" before "2").
    expect(entry.files.map(f => f.id)).toEqual([2, 1])
    expect(entry.drawing).toBe(entry.files[0])
  })

  it('is case-insensitive when natural-sorting sheet file names', () => {
    const drawings = [
      makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - sheet B - Rev 1.pdf' }),
      makePdf({ id: 2, file_name: 'DBN-B1-CTR10 - Sheet A - Rev 1.pdf' }),
    ]
    const [entry] = listMarkDrawingRevs(drawings, 'DBN-B1-CTR10')
    expect(entry.files.map(f => f.id)).toEqual([2, 1])
  })

  it('returns a single-element files array (= [drawing]) when a rev has only one file', () => {
    const drawings = [makePdf({ id: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    const [entry] = listMarkDrawingRevs(drawings, 'DBN-B1-CTR10')
    expect(entry.files).toEqual([entry.drawing])
    expect(entry.files).toHaveLength(1)
  })

  // A higher rev must win even when a lower rev's file happens to have been
  // uploaded more recently — grouping/sorting is by rev, never by
  // create_date (create_date only tie-breaks WITHIN one rev, see the test
  // above).
  it('a higher rev always outranks a more recently uploaded lower rev', () => {
    const drawings = [
      makePdf({ id: 1, rev: 2, file_name: 'DBN-B1-CTR10 - - Rev 2.pdf', create_date: '2026-01-01T00:00:00Z' }),
      makePdf({ id: 2, rev: 1, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf', create_date: '2026-06-01T00:00:00Z' }),
    ]
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10'))).toEqual([[2, 1], [1, 2]])
  })

  // The primary match path, now that drawings carry a real mark column —
  // used directly; filename extraction never runs when it's present.
  it('matches via the real d.mark field when present, not just the filename', () => {
    const drawings = [makePdf({ id: 1, mark: 'DBN-B1-CTR10', file_name: 'something totally different.pdf' })]
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
  })

  // Legacy rows that predate the mark/rev backfill have mark === null — the
  // only case that still falls back to the filename.
  it('falls back to the filename-derived mark when d.mark is null', () => {
    const drawings = [makePdf({ id: 1, mark: null, file_name: 'DBN-B1-CTR10 - - Rev 1.pdf' })]
    expect(ids(listMarkDrawingRevs(drawings, 'DBN-B1-CTR10'))).toEqual([[1, 1]])
  })
})
