// mo-part.service.spec.ts — round 3: marks, several sources, edit in any
// status except CANCELLED, field-level change log.
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { MoPartService } from './mo-part.service'

const LINE = { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 6, unit_weight_kg: 828.17 }
const MARK = { mark: 'BUH1-3', set_qty: 2, length_mm: 10550, width_mm: 400, height_mm: 1200, weight_kg: 7122.3 }
const INPUT = {
  project_id: 5, zone_id: 3, primary_mark_prefix_code: 'FLG', routing_template_id: 3,
  part_sources: ['MATERIAL_LIST' as const, 'DISPATCH_NOTE' as const],
  source_files: [{ kind: 'MATERIAL_LIST' as const, filename: 'ML.xls' }, { kind: 'DISPATCH_NOTE' as const, filename: 'DN.xls' }],
  part_marks: [MARK],
  part_lines: [{ ...LINE, mark: 'BUH1-3' }, { profile: 'PL20x115', grade: 'SM520', length_mm: 550, qty: 16 }],
}

function make(over: Partial<Record<string, unknown>> = {}, txOver: Partial<Record<string, unknown>> = {}) {
  const tx = {
    manufacturing_order: {
      create: jest.fn().mockResolvedValue({ id: 77, mo_code: 'MO-26000077' }),
      update: jest.fn().mockResolvedValue({ id: 77, mo_code: 'MO-26000077' }),
      findUnique: jest.fn(),
    },
    mo_status_history: { create: jest.fn() },
    mo_part_mark: {
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(({ data }: any) => Promise.resolve(data.map((m: any, i: number) => ({ id: 500 + i, mark: m.mark })))),
    },
    mo_part_line: { deleteMany: jest.fn(), createMany: jest.fn() },
    mo_part_change: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...txOver,
  }
  const prisma = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 5 }) },
    project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
    sub_zone: { findFirst: jest.fn().mockResolvedValue({ id: 8 }) },
    mark_prefix_master: { findUnique: jest.fn().mockResolvedValue({ code: 'FLG' }) },
    routing_template: { findUnique: jest.fn().mockResolvedValue({ id: 3 }) },
    bom_dispatch: { findUnique: jest.fn().mockResolvedValue({ id: 10 }) },
    bom_part: { findMany: jest.fn().mockResolvedValue([]) },
    mo_part_change: { findMany: jest.fn().mockResolvedValue([]) },
    manufacturing_order: { findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    ...over,
  }
  const mail = { log: jest.fn() }
  const codeGen = { generate: jest.fn().mockResolvedValue('MO-26000077') }
  return { svc: new MoPartService(prisma as any, mail as any, codeGen as any), prisma, tx, mail }
}

describe('MoPartService.create', () => {
  it('creates a DRAFT PART MO with marks, mark-linked lines, sources and a first log entry', async () => {
    const { svc, tx, mail } = make()
    await expect(svc.create(INPUT, 1, 'tao')).resolves.toEqual({ id: 77, mo_code: 'MO-26000077' })
    const data = tx.manufacturing_order.create.mock.calls[0][0].data
    expect(data).toMatchObject({ kind: 'PART', project_id: 5, zone_id: 3, sub_zone_id: null, status: 'DRAFT', part_sources: ['MATERIAL_LIST', 'DISPATCH_NOTE'] })
    expect(data.source_files).toEqual([
      { kind: 'MATERIAL_LIST', filename: 'ML.xls', at: expect.any(String) },
      { kind: 'DISPATCH_NOTE', filename: 'DN.xls', at: expect.any(String) },
    ])
    expect(tx.mo_part_mark.createManyAndReturn.mock.calls[0][0].data[0]).toMatchObject({ mo_id: 77, mark: 'BUH1-3' })
    const rows = tx.mo_part_line.createMany.mock.calls[0][0].data
    expect(rows[0]).toMatchObject({ mo_id: 77, line_seq: 0, mark_id: 500, profile: 'PL25x400', holes: [] })
    expect(rows[1]).toMatchObject({ mo_id: 77, line_seq: 1, mark_id: null, profile: 'PL20x115' })
    expect(tx.mo_part_change.create.mock.calls[0][0].data).toMatchObject({ mo_id: 77, changed_by: 'tao', note: 'created' })
    expect(mail.log.mock.calls[0][0].subject).toBe('MO MO-26000077 created (DRAFT) · MO Part · MATERIAL_LIST, DISPATCH_NOTE · files ML.xls, DN.xls')
  })
  it('saves marks with no plate lines yet (Dispatch Note only, thickness unknown — fill in later)', async () => {
    const { svc, tx } = make()
    await expect(svc.create({ ...INPUT, part_sources: ['DISPATCH_NOTE'], part_lines: [] }, 1, 'tao')).resolves.toEqual({ id: 77, mo_code: 'MO-26000077' })
    expect(tx.mo_part_line.createMany).not.toHaveBeenCalled()
  })
  it('still rejects an MO Part with neither marks nor lines', async () => {
    const { svc } = make()
    const err = await svc.create({ ...INPUT, part_marks: [], part_lines: [] }, 1, 'tao').catch(e => e)
    expect(err.getResponse().message).toEqual(['At least one line is required'])
  })
  it('rejects invalid marks and lines with every message', async () => {
    const { svc } = make()
    const err = await svc.create({ ...INPUT, part_marks: [MARK, MARK], part_lines: [{ ...LINE, mark: 'ZZ' }] }, 1, 'tao').catch(e => e)
    expect(err).toBeInstanceOf(BadRequestException)
    expect(err.getResponse().message).toEqual(['Mark BUH1-3 appears twice', 'Row 1: mark ZZ is not in the mark list'])
  })
  it('rejects an empty or unknown source list', async () => {
    const { svc } = make()
    await expect(svc.create({ ...INPUT, part_sources: [] }, 1, 'tao')).rejects.toThrow(new BadRequestException('At least one source is required'))
    await expect(svc.create({ ...INPUT, part_sources: ['EMAIL' as any] }, 1, 'tao')).rejects.toThrow(new BadRequestException('Unknown source EMAIL'))
  })
  it('rejects bom_part_ids unless BOM_PART_LIST is a source', async () => {
    const { svc } = make()
    await expect(svc.create({ ...INPUT, part_lines: [{ ...LINE, bom_part_ids: [1] }] }, 1, 'tao'))
      .rejects.toThrow(new BadRequestException('bom_part_ids are only allowed when BOM_PART_LIST is a source'))
  })
  it('rejects bom_part_ids from another project', async () => {
    const { svc } = make({ bom_part: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) } })
    await expect(svc.create({ ...INPUT, part_sources: ['BOM_PART_LIST'], part_marks: [], part_lines: [{ ...LINE, bom_part_ids: [1, 2] }] }, 1, 'tao'))
      .rejects.toThrow(new BadRequestException('bom_part_ids not found in this zone: 2'))
  })
  it('rejects a zone that is not in the project', async () => {
    const { svc, prisma } = make({ project_zone: { findFirst: jest.fn().mockResolvedValue(null) } })
    await expect(svc.create(INPUT, 1, 'tao')).rejects.toThrow(new BadRequestException('Zone 3 is not in project 5'))
    expect((prisma as any).project_zone.findFirst.mock.calls[0][0].where).toEqual({ id: 3, project_id: 5 })
  })
  it('rejects a sub-zone that is not in the zone, and saves a valid one', async () => {
    const bad = make({ sub_zone: { findFirst: jest.fn().mockResolvedValue(null) } })
    await expect(bad.svc.create({ ...INPUT, sub_zone_id: 9 }, 1, 'tao')).rejects.toThrow(new BadRequestException('Sub-zone 9 is not in zone 3'))
    const ok = make()
    await ok.svc.create({ ...INPUT, sub_zone_id: 8 }, 1, 'tao')
    expect(ok.tx.manufacturing_order.create.mock.calls[0][0].data.sub_zone_id).toBe(8)
  })
  it('checks bom_part_ids against the zone, not just the project', async () => {
    const { svc, prisma } = make({ bom_part: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) } })
    await svc.create({ ...INPUT, part_sources: ['BOM_PART_LIST'], part_marks: [], part_lines: [{ ...LINE, bom_part_ids: [1] }] }, 1, 'tao')
    expect((prisma as any).bom_part.findMany.mock.calls[0][0].where).toEqual({ id: { in: [1] }, dispatch: { project_id: 5, zone_id: 3 } })
  })
  it('404s on a missing project', async () => {
    const { svc } = make({ project: { findUnique: jest.fn().mockResolvedValue(null) } })
    await expect(svc.create(INPUT, 1, 'tao')).rejects.toThrow(NotFoundException)
  })
  it('caps a grouped part_mark at 60 chars', async () => {
    const { svc, tx } = make()
    await svc.create({ ...INPUT, part_marks: [], part_lines: [{ ...LINE, part_mark: 'C-f'.repeat(30) }] }, 1, 'tao')
    expect(tx.mo_part_line.createMany.mock.calls[0][0].data[0].part_mark).toHaveLength(60)
  })
})

describe('MoPartService.update', () => {
  const existing = (status: string, kind = 'PART') => ({
    id: 77, mo_code: 'MO-26000077', kind, status, project_id: 5,
    part_sources: ['MATERIAL_LIST'], source_files: [{ kind: 'MATERIAL_LIST', filename: 'ML.xls', at: '2026-10-06T00:00:00.000Z' }],
    primary_mark_prefix_code: 'FLG', routing_template_id: 3, plan_start: null, plan_finish: null,
    part_marks: [{ ...MARK, tw_mm: null, tf_mm: null }],
    part_lines: [{ ...LINE, qty: '6', mark: { mark: 'BUH1-3' }, part_mark: null, unit_weight_kg: '828.17', cut_length_mm: null, holes: [], bom_part_ids: [] }],
  })
  const UPD = { primary_mark_prefix_code: 'FLG', routing_template_id: 3, part_marks: [MARK], part_lines: [{ ...LINE, mark: 'BUH1-3', qty: 4 }] }
  const withMo = (mo: unknown) => {
    const order: string[] = []
    const m = make({}, {
      manufacturing_order: { update: jest.fn().mockResolvedValue({ id: 77, mo_code: 'MO-26000077' }), findUnique: jest.fn(() => { order.push('read'); return Promise.resolve(mo) }) },
      $queryRaw: jest.fn(() => { order.push('lock'); return Promise.resolve([]) }),
    })
    return { ...m, order }
  }

  it('locks the MO row (FOR UPDATE) before reading its status', async () => {
    const { svc, tx, order } = withMo(existing('CONFIRMED'))
    await svc.update(77, UPD, 1, 'tao')
    expect(order).toEqual(['lock', 'read'])
    expect((tx as any).$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE')
  })

  it('edits a CONFIRMED MO Part and logs only the changed field', async () => {
    const { svc, tx, mail } = withMo(existing('CONFIRMED'))
    await expect(svc.update(77, { ...UPD, note: 'flange 6 → 4' }, 1, 'tao')).resolves.toEqual({ id: 77, mo_code: 'MO-26000077' })
    expect(tx.mo_part_line.deleteMany).toHaveBeenCalledWith({ where: { mo_id: 77 } })
    expect(tx.mo_part_mark.deleteMany).toHaveBeenCalledWith({ where: { mo_id: 77 } })
    expect(tx.mo_part_change.create.mock.calls[0][0].data).toEqual({
      mo_id: 77, changed_by: 'tao', note: 'flange 6 → 4',
      changes: [{ entity: 'line', key: 'BUH1-3|-|PL25X400|SM520|10550', field: 'qty', old: 6, new: 4 }],
    })
    expect(mail.log.mock.calls[0][0].subject).toBe('MO MO-26000077 edited · 1 change')
  })
  it('writes no log entry when nothing changed', async () => {
    const { svc, tx } = withMo(existing('DONE'))
    await svc.update(77, { ...UPD, part_lines: [{ ...LINE, mark: 'BUH1-3' }] }, 1, 'tao')
    expect(tx.mo_part_change.create).not.toHaveBeenCalled()
  })
  it('appends new source files and sources', async () => {
    const { svc, tx } = withMo(existing('DRAFT'))
    await svc.update(77, { ...UPD, part_sources: ['DISPATCH_NOTE'], source_files: [{ kind: 'DISPATCH_NOTE', filename: 'DN.xls' }] }, 1, 'tao')
    const data = tx.manufacturing_order.update.mock.calls[0][0].data
    expect(data.part_sources).toEqual(['MATERIAL_LIST', 'DISPATCH_NOTE'])
    expect(data.source_files).toHaveLength(2)
  })
  it('409s on a CANCELLED MO Part', async () => {
    const { svc } = withMo(existing('CANCELLED'))
    await expect(svc.update(77, UPD, 1, 'tao')).rejects.toThrow(new ConflictException('A cancelled MO Part cannot be edited'))
  })
  it('409s when the MO is an assembly MO', async () => {
    const { svc } = withMo(existing('DRAFT', 'ASSEMBLY'))
    await expect(svc.update(77, UPD, 1, 'tao')).rejects.toThrow(new ConflictException('MO 77 is not an MO Part'))
  })
  it('404s on a missing MO', async () => {
    const { svc } = withMo(null)
    await expect(svc.update(77, UPD, 1, 'tao')).rejects.toThrow(NotFoundException)
  })
})

describe('MoPartService.history', () => {
  it('returns the log newest first', async () => {
    const rows = [{ id: 2, changed_by: 'tao', changed_at: new Date(1), note: null, changes: [] }]
    const { svc, prisma } = make({ mo_part_change: { findMany: jest.fn().mockResolvedValue(rows) } })
    await expect(svc.history(77)).resolves.toEqual(rows)
    expect((prisma as any).mo_part_change.findMany.mock.calls[0][0]).toEqual({ where: { mo_id: 77 }, orderBy: { id: 'desc' } })
  })
})

describe('MoPartService.bomPartLines', () => {
  it('reads ACTIVE parts of the dispatch (optionally one slot) and groups them', async () => {
    const parts = [{ id: 1, part_mark: 'C-f1', profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 6, weight_kg: 828.17 }]
    const { svc, prisma } = make({ bom_part: { findMany: jest.fn().mockResolvedValue(parts) } })
    const r = await svc.bomPartLines(10, 'MAIN')
    expect((prisma as any).bom_part.findMany.mock.calls[0][0].where).toEqual({ dispatch_id: 10, status: 'ACTIVE', slot: 'MAIN' })
    expect(r.lines[0]).toMatchObject({ qty: 6, bom_part_ids: [1] })
  })
  it('404s on a missing dispatch', async () => {
    const { svc } = make({ bom_dispatch: { findUnique: jest.fn().mockResolvedValue(null) } })
    await expect(svc.bomPartLines(999)).rejects.toThrow(NotFoundException)
  })
})
