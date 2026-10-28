import { NotFoundException } from '@nestjs/common'
import { MarkRevHistoryService, revEntries, type HistRow } from './mark-rev-history.service'
import { snapshot } from './mark-rev'

const at = (d: string) => new Date(`2026-10-${d}T03:00:00Z`)
const H = (mark: string, dispatch_id: number, rev: number, over: Partial<HistRow> = {}): HistRow => ({
  assembly_mark: mark, dispatch_id, rev, rev_source: 'CARRIED', dn_status: null,
  snap: snapshot({ assembly_mark: mark, qty: 2, length_mm: 650 }, []), uploaded_at: at(String(10 + dispatch_id)), uploaded_by: 'tao', ...over,
})

describe('revEntries', () => {
  it('one entry per rev (or rename), newest first; the first lists its values, later ones a field diff', () => {
    const rows = [
      H('B1', 1, 0, { rev_source: 'NEW' }),
      H('B1', 2, 0), // re-upload, same rev → folded
      H('B1', 3, 1, { rev_source: 'MANUAL', snap: snapshot({ assembly_mark: 'B1', qty: 2, length_mm: 700 }, []) }),
      H('3B1', 4, 1, { snap: snapshot({ assembly_mark: '3B1', qty: 2, length_mm: 700 }, []) }), // renamed, rev carried
    ]
    const e = revEntries(rows, new Map([[1, 1], [2, 2], [3, 3], [4, 4]]))
    expect(e.map(x => [x.mark, x.rev, x.upload_no, x.first, x.renamed_from, x.rev_source])).toEqual([
      ['3B1', 1, 4, false, 'B1', 'CARRIED'],
      ['B1', 1, 3, false, null, 'MANUAL'],
      ['B1', 0, 1, true, null, 'NEW'],
    ])
    expect(e[1].diff!.fields).toEqual([{ field: 'length_mm', old: 650, new: 700 }])
    expect(e[2].values).toMatchObject({ mark: 'B1', qty: 2, length_mm: 650 })
    expect(e[0].diff!.fields).toEqual([]) // only the name changed
  })
})

describe('MarkRevHistoryService.history', () => {
  function make(rows: any[], renames: any[] = []) {
    const prisma: any = {
      bom_assembly: {
        findUnique: jest.fn().mockResolvedValue({ id: 30, assembly_mark: '3B1', dispatch_id: 4, rev: 1, dispatch: { project_id: 1, zone_id: 2, sub_zone_id: null } }),
        findMany: jest.fn().mockResolvedValue(rows),
      },
      bom_dispatch: { findMany: jest.fn(({ where }: any) => Promise.resolve([1, 4].filter(id => !where.id || where.id.in.includes(id)).map(id => ({ id, project_id: 1, zone_id: 2, sub_zone_id: null })))) },
    }
    const alias: any = { renamesFor: jest.fn().mockResolvedValue(renames) }
    return { svc: new MarkRevHistoryService(prisma, alias), prisma, alias }
  }
  const row = (mark: string, dispatch_id: number, rev: number, over: object = {}) => ({
    assembly_mark: mark, dispatch_id, rev, rev_source: 'NEW', dn_status: null, name: null, qty: '2.000', length_mm: '650.00', width_mm: null, height_mm: null, weight_kg: null, surface_area_m2: null,
    assembly_parts: [], dispatch: { uploaded_at: at('11'), create_user: { name: 'tao' } }, ...over,
  })

  it('walks the mark through its rename aliases within the zone, real uploads only, up to this row', async () => {
    // the own row (3B1, dispatch 4) is at rev 1 — consistent with findUnique; renamed AND its length changed
    const { svc, prisma } = make(
      [row('B1', 1, 0), row('3B1', 4, 1, { rev_source: 'MANUAL', length_mm: '700.00' })],
      [{ id: 7, kind: 'ASSEMBLY', from_mark: 'B1', to_mark: '3B1', dispatch_id: 4 }],
    )
    const h = await svc.history(30)
    expect(h).toMatchObject({ assembly_id: 30, mark: '3B1', current_rev: 1 })
    expect(h.entries[0].rev).toBe(h.current_rev)
    expect(h.entries.map(e => [e.mark, e.rev, e.upload_no, e.uploaded_by, e.first, e.renamed_from, e.rev_source])).toEqual([
      ['3B1', 1, 2, 'tao', false, 'B1', 'MANUAL'],
      ['B1', 0, 1, 'tao', true, null, 'NEW'],
    ])
    expect(h.entries[0].diff).toEqual({ fields: [{ field: 'length_mm', old: 650, new: 700 }], parts_added: [], parts_removed: [], parts_changed: [] })
    expect(h.entries[0].values).toBeNull()
    expect(h.entries[1].values).toMatchObject({ mark: 'B1', qty: 2, length_mm: 650 })
    expect(h.entries[1].diff).toBeNull()
    const where = prisma.bom_assembly.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ dispatch: { project_id: 1, zone_id: 2, sub_zone_id: null, source: 'BOM_UPLOAD' } })
    expect(where.AND).toContainEqual({ dispatch_id: { lte: 4 } })
    expect(where.AND[0]).toEqual({ OR: [{ assembly_mark: '3B1' }, { assembly_mark: 'B1', dispatch_id: { lt: 4 } }] })
  })

  it('unknown assembly → 404 in Thai', async () => {
    const { svc, prisma } = make([])
    prisma.bom_assembly.findUnique.mockResolvedValue(null)
    await expect(svc.history(99)).rejects.toThrow(new NotFoundException('ไม่พบ mark นี้'))
  })
})
