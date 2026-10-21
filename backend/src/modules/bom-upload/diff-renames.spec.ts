import { renamePrev, tagRenamed } from './diff-renames'
import { BomDiffService } from './bom-diff.service'

const asmItem = (m: string) => ({ assembly_mark: m, name: 'H', qty: 2, weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: null, height_mm: null })
const partItem = (m: string) => ({ part_mark: m, description: null, profile: 'PL25x400', grade: 'SM520', qty: 4, length_mm: 1000, weight_kg: 10 })
const renames = [{ id: 1, kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }, { id: 2, kind: 'PART', from_mark: 'C-x', to_mark: '3C-x' }]

describe('diff-renames', () => {
  it('renamePrev moves old names to new names in assemblies, parts and junctions', () => {
    const out = renamePrev({ assemblies: [asmItem('BUH1B-18'), asmItem('K')], parts: [partItem('C-x')], junctions: [{ assembly_mark: 'BUH1B-18', part_mark: 'C-x', qty: 1 }] }, renames)
    expect(out.assemblies.map(a => a.assembly_mark)).toEqual(['3BUH1B-18', 'K'])
    expect(out.parts.map(p => p.part_mark)).toEqual(['3C-x'])
    expect(out.junctions).toEqual([{ assembly_mark: '3BUH1B-18', part_mark: '3C-x', qty: 1 }])
  })

  it('tagRenamed marks only rows that have both sides', () => {
    const rows = tagRenamed([{ status: 'unchanged', prev: asmItem('3BUH1B-18'), curr: asmItem('3BUH1B-18') }, { status: 'added', prev: null, curr: asmItem('N') }],
      a => a.assembly_mark, renames, 'ASSEMBLY')
    expect(rows[0]).toMatchObject({ renamed_from: 'BUH1B-18', rename_id: 1 })
    expect(rows[1]).not.toHaveProperty('renamed_from')
  })
})

describe('BomDiffService.computeDiff with a confirmed pair', () => {
  it('one row "เปลี่ยนชื่อ" instead of removed + added; junctions stay unchanged', async () => {
    const prisma: any = {
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue(renames) },
      bom_dispatch: { findMany: jest.fn().mockResolvedValue([{ id: 9, status: 'complete' }]) },
    }
    const svc = new BomDiffService(prisma)
    jest.spyOn(svc, 'findPreviousRevisionGroup').mockResolvedValue({ current: { mainId: 9, accId: 9 }, previous: { mainId: 5, accId: 5 } })
    jest.spyOn(svc as any, 'loadRevisionGroupData').mockImplementation(async (g: any) => (g.mainId === 5
      ? { assemblies: [asmItem('BUH1B-18')], parts: [partItem('C-x')], junctions: [{ assembly_mark: 'BUH1B-18', part_mark: 'C-x', qty: 1 }] }
      : { assemblies: [asmItem('3BUH1B-18')], parts: [partItem('3C-x')], junctions: [{ assembly_mark: '3BUH1B-18', part_mark: '3C-x', qty: 1 }] }))
    jest.spyOn(svc as any, 'computeAggregate').mockResolvedValue({})

    const r = await svc.computeDiff(9)

    expect(prisma.bom_mark_rename.findMany).toHaveBeenCalledWith({ where: { dispatch_id: { in: [9] } }, select: { id: true, kind: true, from_mark: true, to_mark: true } })
    expect(r!.assembly_diff).toEqual([{ status: 'unchanged', prev: asmItem('3BUH1B-18'), curr: asmItem('3BUH1B-18'), renamed_from: 'BUH1B-18', rename_id: 1 }])
    expect(r!.part_diff).toEqual([{ status: 'unchanged', prev: partItem('3C-x'), curr: partItem('3C-x'), renamed_from: 'C-x', rename_id: 2 }])
    expect(r!.junction_diff.map(j => j.status)).toEqual(['unchanged'])
  })
})
