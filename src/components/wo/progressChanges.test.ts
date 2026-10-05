import { formatProgressChanges } from './progressChanges'

describe('formatProgressChanges', () => {
  it('renders field labels with old → new', () => {
    expect(formatProgressChanges([{ field: 'qty_done', old: 5, new: 8 }, { field: 'qty_qc_passed', old: 4, new: 6 }])).toBe('Done 5 → 8, QC Passed 4 → 6')
  })
  it('renders null as an em dash and handles empty input', () => {
    expect(formatProgressChanges([{ field: 'qty_not_started', old: null, new: 10 }])).toBe('Not Started — → 10')
    expect(formatProgressChanges(null)).toBe('')
    expect(formatProgressChanges([])).toBe('')
  })
  it('drops blank → 0 noise on the six progress fields (logged before the backend stopped recording it)', () => {
    expect(formatProgressChanges([
      { field: 'qty_in_progress', old: null, new: 1 },
      { field: 'qty_done', old: null, new: 0 },
      { field: 'qty_rework', old: 0, new: null },
    ])).toBe('In Progress — → 1')
    // Quantity is a real value, never noise.
    expect(formatProgressChanges([{ field: 'qty_planned', old: null, new: 0 }])).toBe('Quantity — → 0')
  })
})
