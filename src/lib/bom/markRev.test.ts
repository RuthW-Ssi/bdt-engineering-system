import { revMoveText, revUpOf } from './markRev'

describe('revMoveText / revUpOf', () => {
  it('"Rev 1 → 2", plus "ข้อมูล BOM ไม่เปลี่ยน" for a hand-raised rev with no data change', () => {
    expect(revMoveText({ from: 1, to: 2 }, false)).toBe('Rev 1 → 2')
    expect(revMoveText({ from: 1, to: 2 }, true)).toBe('Rev 1 → 2 · ข้อมูล BOM ไม่เปลี่ยน')
    expect(revMoveText(null, true)).toBeNull()
  })
  it('reads REV_UP out of a WO bom-version status', () => {
    expect(revUpOf({ delta_types: ['REV_UP'], delta_details: { rev: { from: 0, to: 3 } } })).toEqual({ from: 0, to: 3 })
    expect(revUpOf({ delta_types: ['SPEC_CHANGED'], delta_details: null })).toBeNull()
    expect(revUpOf(null)).toBeNull()
  })
})
