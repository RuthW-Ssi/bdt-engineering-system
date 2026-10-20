import { classifyUpload } from './drawingUploadReview'
import type { Drawing } from '../api/drawings'

// Two files already on record for mark A, both at rev 1 (a sheet + a
// differently-named sheet at the same rev) — mirrors how a real zone has
// several drawing sheets per mark/rev.
function drawing(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1,
    project_id: 1,
    zone_id: 1,
    sub_zone_id: null,
    mark: 'A',
    rev: 1,
    file_key: 'drawings/P1/Z1/A/rev1/A - BEAM - Rev 1.pdf',
    file_name: 'A - BEAM - Rev 1.pdf',
    mime_type: 'application/pdf',
    uploaded_by_id: 1,
    create_date: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const existing: Drawing[] = [
  drawing({ id: 1, file_name: 'A - BEAM - Rev 1.pdf', file_key: 'drawings/P1/Z1/A/rev1/A - BEAM - Rev 1.pdf' }),
  drawing({ id: 2, file_name: 'A - 1 -  - Rev 1.pdf', file_key: 'drawings/P1/Z1/A/rev1/A - 1 -  - Rev 1.pdf' }),
]

describe('classifyUpload', () => {
  it('mark null → needs-input', () => {
    expect(classifyUpload({ mark: null, rev: 1, fileName: 'x.pdf' }, existing)).toEqual({ status: 'needs-input', currentRev: null })
  })

  it('rev null → needs-input', () => {
    expect(classifyUpload({ mark: 'A', rev: null, fileName: 'x.pdf' }, existing)).toEqual({ status: 'needs-input', currentRev: null })
  })

  it('mark not in existing → new-mark', () => {
    expect(classifyUpload({ mark: 'B', rev: 1, fileName: 'B - BEAM - Rev 1.pdf' }, existing)).toEqual({ status: 'new-mark', currentRev: null })
  })

  it('mark A rev higher than current → new-rev, reports currentRev', () => {
    expect(classifyUpload({ mark: 'A', rev: 2, fileName: 'A - BEAM - Rev 2.pdf' }, existing)).toEqual({ status: 'new-rev', currentRev: 1 })
  })

  it('mark A rev 1, same file name as an existing row → replace', () => {
    expect(classifyUpload({ mark: 'A', rev: 1, fileName: 'A - BEAM - Rev 1.pdf' }, existing)).toEqual({ status: 'replace', currentRev: 1 })
  })

  it('mark A rev 1, a different file name than either existing row → add-sheet', () => {
    expect(classifyUpload({ mark: 'A', rev: 1, fileName: 'A - PLAN - Rev 1.pdf' }, existing)).toEqual({ status: 'add-sheet', currentRev: 1 })
  })

  it('mark A rev 0, below current rev 1 → lower-rev', () => {
    expect(classifyUpload({ mark: 'A', rev: 0, fileName: 'A - BEAM - Rev .pdf' }, existing)).toEqual({ status: 'lower-rev', currentRev: 1 })
  })

  it('mark matching is case-insensitive', () => {
    expect(classifyUpload({ mark: 'a', rev: 2, fileName: 'a - BEAM - Rev 2.pdf' }, existing)).toEqual({ status: 'new-rev', currentRev: 1 })
  })
})
