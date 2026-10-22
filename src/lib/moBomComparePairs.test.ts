import { prePairs } from './moBomComparePairs'

// Real bomCompare row shape for a renamed mark (task-6-report.md "Fix round 2",
// final row shape): status 'same' | 'changed', kind: 'bom', `bom` already the
// resolved (renamed) target — never 'not_in_bom' / bom: null / candidates.
const row = (mark: string, over: object = {}) => ({
  line_id: 1,
  assembly_mark: mark,
  kind: 'bom',
  status: 'changed',
  reviewed: false,
  existing: {} as any,
  bom: { assembly_id: 1, assembly_mark: mark } as any,
  ...over,
}) as any

describe('prePairs', () => {
  it('rows paired on the BOM page start paired and on "apply"; reviewed rows are left alone', () => {
    expect(prePairs([
      row('BUH1B-18', { renamed_to: { assembly_id: 3010, assembly_mark: '3BUH1B-18', rename_id: 7 } }),
      row('K', { renamed_to: null }),
      row('OLD', { reviewed: true, renamed_to: { assembly_id: 9, assembly_mark: 'X', rename_id: 1 } }),
    ])).toEqual({ pairWith: { 'BUH1B-18': 3010 }, apply: ['BUH1B-18'] })
  })
})
