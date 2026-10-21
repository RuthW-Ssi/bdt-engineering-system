import { MarkAliasService } from './mark-alias.service'

describe('MarkAliasService', () => {
  it('renamesFor reads one BOM scope, oldest first', async () => {
    const prisma: any = { bom_mark_rename: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) } }
    const svc = new MarkAliasService(prisma)
    await expect(svc.renamesFor({ project_id: 3, zone_id: 6, sub_zone_id: null })).resolves.toEqual([{ id: 1 }])
    expect(prisma.bom_mark_rename.findMany).toHaveBeenCalledWith({
      where: { project_id: 3, zone_id: 6, sub_zone_id: null },
      select: { id: true, kind: true, from_mark: true, to_mark: true, dispatch_id: true },
      orderBy: [{ dispatch_id: 'asc' }, { id: 'asc' }],
    })
  })

  it('renamesByScope groups every row by scope', async () => {
    const prisma: any = { bom_mark_rename: { findMany: jest.fn().mockResolvedValue([
      { id: 1, kind: 'ASSEMBLY', from_mark: 'A', to_mark: 'B', dispatch_id: 2, project_id: 3, zone_id: 6, sub_zone_id: null },
      { id: 2, kind: 'PART', from_mark: 'p', to_mark: 'q', dispatch_id: 9, project_id: 3, zone_id: 7, sub_zone_id: 1 },
    ]) } }
    const map = await new MarkAliasService(prisma).renamesByScope()
    expect([...map.keys()]).toEqual(['3:6:', '3:7:1'])
    expect(map.get('3:6:')).toEqual([{ id: 1, kind: 'ASSEMBLY', from_mark: 'A', to_mark: 'B', dispatch_id: 2 }])
  })

  it('markUsed stamps used_at once and skips an empty list', async () => {
    const client: any = { bom_mark_rename: { updateMany: jest.fn() } }
    const svc = new MarkAliasService({} as any)
    await svc.markUsed(client, [])
    expect(client.bom_mark_rename.updateMany).not.toHaveBeenCalled()
    await svc.markUsed(client, [4, 4, 7])
    expect(client.bom_mark_rename.updateMany).toHaveBeenCalledWith({ where: { id: { in: [4, 7] }, used_at: null }, data: { used_at: expect.any(Date) } })
  })
})
