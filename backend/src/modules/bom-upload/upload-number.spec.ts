import { uploadNumbersOf } from './upload-number'

describe('uploadNumbersOf', () => {
  // zone 6: ids 3, 5 (continue-uploaded, same revision), 9 · zone 7: id 4
  const all = [
    { id: 3, project_id: 1, zone_id: 6, sub_zone_id: null },
    { id: 4, project_id: 1, zone_id: 7, sub_zone_id: null },
    { id: 5, project_id: 1, zone_id: 6, sub_zone_id: null },
    { id: 9, project_id: 1, zone_id: 6, sub_zone_id: null },
  ]
  const db = {
    bom_dispatch: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(where.id?.in
        ? all.filter(d => where.id.in.includes(d.id))
        : all.filter(d => where.OR.some((s: any) => s.zone_id === d.zone_id && s.sub_zone_id === d.sub_zone_id)).sort((a, b) => a.id - b.id))),
    },
  }

  it('numbers uploads 1, 2, 3… per zone/sub-zone by upload order, whatever their revision', async () => {
    const n = await uploadNumbersOf(db as any, [9, 4, 5])
    expect([...n.entries()].sort((a, b) => a[0] - b[0])).toEqual([[4, 1], [5, 2], [9, 3]])
  })

  it('counts only real, non-error uploads', async () => {
    await uploadNumbersOf(db as any, [9])
    expect(db.bom_dispatch.findMany.mock.calls.at(-1)![0].where).toMatchObject({ source: 'BOM_UPLOAD', status: { not: 'error' } })
  })

  it('no ids → empty map, no query', async () => {
    db.bom_dispatch.findMany.mockClear()
    expect((await uploadNumbersOf(db as any, [])).size).toBe(0)
    expect(db.bom_dispatch.findMany).not.toHaveBeenCalled()
  })
})
