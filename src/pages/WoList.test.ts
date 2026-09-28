import { formatMarks } from './WoList'

// NOTE on scope: WoList.tsx itself (data fetching via useWos, filters,
// pagination) isn't mounted/tested here — same "extract and test the pure
// piece" precedent as qtyReusableValid / findLatestPdfForMark elsewhere in
// this codebase. `formatMarks` is the one bit of new logic the multi-mark
// redesign added to this page (assembly_mark singular → assembly_marks[]).

describe('formatMarks', () => {
  it('returns an em dash for no marks', () => {
    expect(formatMarks([])).toBe('—')
  })

  it('returns the mark itself when there is exactly one', () => {
    expect(formatMarks(['A1'])).toBe('A1')
  })

  it('shows the first mark plus a "+N" count for more than one', () => {
    expect(formatMarks(['A1', 'A2', 'A3'])).toBe('A1 +2')
  })

  it('counts every extra mark, not just a capped preview', () => {
    expect(formatMarks(['A1', 'A2', 'A3', 'A4', 'A5'])).toBe('A1 +4')
  })
})
