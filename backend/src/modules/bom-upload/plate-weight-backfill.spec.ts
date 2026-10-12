import { planPlateWeightFixes } from './plate-weight-backfill'

describe('planPlateWeightFixes', () => {
  const parts = [
    { id: 1, dispatch_id: 7, part_mark: 'A-p1', profile: 'PL10', weight_kg: 78.5 },
    { id: 2, dispatch_id: 7, part_mark: 'A-p2', profile: 'PL12', weight_kg: 11.79 },
    { id: 3, dispatch_id: 7, part_mark: 'A-p3', profile: 'PL10', weight_kg: 78.5 },
    { id: 4, dispatch_id: 7, part_mark: 'A-r1', profile: 'PIPE60.5X3.2', weight_kg: 26.4 },
    { id: 5, dispatch_id: 9, part_mark: 'B-p1', profile: 'PL8', weight_kg: 62.8 },
  ]
  const weights = new Map([[7, new Map([['A-p1', 7.02], ['A-p2', 11.79], ['A-r1', 25]])]])

  it('fixes only PL rows whose Part List weight differs; never touches other profiles', () => {
    const r = planPlateWeightFixes(parts, weights)
    expect(r.fixes).toEqual([{ id: 1, dispatch_id: 7, part_mark: 'A-p1', from: 78.5, to: 7.02 }])
  })
  it('lists PL rows it cannot fix and why', () => {
    const r = planPlateWeightFixes(parts, weights)
    expect(r.skipped).toEqual([
      { id: 3, part_mark: 'A-p3', reason: 'no weight in the Part List' },
      { id: 5, part_mark: 'B-p1', reason: 'no stored Part List for dispatch 9' },
    ])
    expect(r.unchanged).toBe(1)
  })
})
