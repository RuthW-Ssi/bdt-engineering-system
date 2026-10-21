import { buildExpectedFileKey } from './file-key'

// Mirrors the frontend's drawingKey() tests (src/hooks/useDrawings.test.tsx)
// exactly — same inputs, same expected keys — since this function exists
// purely to reproduce that frontend logic server-side for verification.
describe('buildExpectedFileKey', () => {
  it('builds drawings/<project>/<zone>/<mark>/rev<n>/<file> with no sub-zone', () => {
    expect(
      buildExpectedFileKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: null }, '2BUH1A-1', 2, '2BUH1A-1 - BEAM - Rev 2.pdf'),
    ).toBe('drawings/P1/Z1/2BUH1A-1/rev2/2BUH1A-1 - BEAM - Rev 2.pdf')
  })

  it('inserts the sub-zone code segment when present', () => {
    expect(
      buildExpectedFileKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: 'S1' }, 'B1', 0, 'plan-A.pdf'),
    ).toBe('drawings/P1/Z1/S1/B1/rev0/plan-A.pdf')
  })

  // sub_zone.code is a nullable DB column — a sub-zone WITHOUT a code must
  // drop the segment entirely (not emit an empty one), exactly like the
  // frontend's `scope.subZoneCode ? ... : ''` ternary.
  it('drops the sub-zone segment entirely when subZoneCode is an empty string (DB code column is blank, not null)', () => {
    expect(
      buildExpectedFileKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: '' }, 'B1', 0, 'plan-A.pdf'),
    ).toBe('drawings/P1/Z1/B1/rev0/plan-A.pdf')
  })

  it('sanitizes / and \\ in the mark so it cannot add extra path segments', () => {
    expect(
      buildExpectedFileKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: null }, 'A/B\\C', 1, 'plan.pdf'),
    ).toBe('drawings/P1/Z1/A_B_C/rev1/plan.pdf')
  })

  it('sanitizes / and \\ in the file name so it cannot add extra path segments', () => {
    expect(
      buildExpectedFileKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: null }, 'B1', 1, 'a/b\\c.pdf'),
    ).toBe('drawings/P1/Z1/B1/rev1/a_b_c.pdf')
  })
})
