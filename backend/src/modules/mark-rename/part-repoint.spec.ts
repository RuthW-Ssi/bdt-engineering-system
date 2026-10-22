import { planPartRepoint } from './part-repoint'

const same = (m: string) => ({ mark: m, renameIds: [] })
const oldParts = [{ id: 11, part_mark: 'C-f1' }, { id: 12, part_mark: 'C-x' }, { id: 13, part_mark: 'C-gone' }]
const newParts = [{ id: 21, part_mark: 'C-f1' }, { id: 22, part_mark: '3C-x' }]
const wp = (id: number, ap: number, updated_by: string | null = null, wo = 1) => ({ id, work_order_id: wo, bom_assembly_part_id: ap, updated_by })

describe('planPartRepoint', () => {
  it('moves by same name, and by a confirmed part rename (reporting the pair used)', () => {
    const plan = planPartRepoint(oldParts, newParts, [wp(1, 11, 'tao'), wp(2, 12, 'tao')], m => (m === 'C-x' ? { mark: '3C-x', renameIds: [8] } : same(m)))
    expect(plan).toEqual({ moves: [{ id: 1, to: 21 }, { id: 2, to: 22 }], drops: [], stuck: [], usedRenameIds: [8] })
  })

  it('no target: untouched row is dropped, a row with a withdrawal blocks', () => {
    const plan = planPartRepoint(oldParts, newParts, [wp(3, 13), wp(4, 12, 'tao')], same)
    expect(plan.drops).toEqual([3])
    expect(plan.stuck).toEqual([{ id: 4, work_order_id: 1, part_mark: 'C-x' }])
  })

  it('never moves onto a new part the same WO already has a row for (unique key)', () => {
    const plan = planPartRepoint(oldParts, newParts, [wp(5, 21, null), wp(6, 11, null)], same)
    expect(plan.moves).toEqual([])
    expect(plan.drops).toEqual([6])
  })

  it('rows of other WOs are planned independently', () => {
    const plan = planPartRepoint(oldParts, newParts, [wp(7, 11, 'a', 1), wp(8, 11, 'b', 2)], same)
    expect(plan.moves).toEqual([{ id: 7, to: 21 }, { id: 8, to: 21 }])
  })
})
