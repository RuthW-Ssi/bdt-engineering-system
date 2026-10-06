// mo-part.service.spec.ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { MoPartService } from './mo-part.service'

const LINE = { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 6, unit_weight_kg: 828.17 }
const INPUT = { project_id: 5, primary_mark_prefix_code: 'FLG', routing_template_id: 3, part_source: 'MATERIAL_LIST' as const, source_filename: 'ML.xls', part_lines: [LINE] }

function make(over: Partial<Record<string, unknown>> = {}) {
  const tx = {
    manufacturing_order: { create: jest.fn().mockResolvedValue({ id: 77, mo_code: 'MO-26000077' }) },
    mo_status_history: { create: jest.fn() },
  }
  const prisma = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 5 }) },
    mark_prefix_master: { findUnique: jest.fn().mockResolvedValue({ code: 'FLG' }) },
    routing_template: { findUnique: jest.fn().mockResolvedValue({ id: 3 }) },
    bom_dispatch: { findUnique: jest.fn().mockResolvedValue({ id: 10 }) },
    bom_part: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    ...over,
  }
  const mail = { log: jest.fn() }
  const codeGen = { generate: jest.fn().mockResolvedValue('MO-26000077') }
  return { svc: new MoPartService(prisma as any, mail as any, codeGen as any), prisma, tx, mail }
}

describe('MoPartService.create', () => {
  it('creates a DRAFT PART MO with size lines and logs source + filename', async () => {
    const { svc, tx, mail } = make()
    await expect(svc.create(INPUT, 1, 'tao')).resolves.toEqual({ id: 77, mo_code: 'MO-26000077' })
    const data = tx.manufacturing_order.create.mock.calls[0][0].data
    expect(data).toMatchObject({ kind: 'PART', project_id: 5, part_source: 'MATERIAL_LIST', status: 'DRAFT', primary_mark_prefix_code: 'FLG', routing_template_id: 3 })
    expect(data.part_lines.create[0]).toMatchObject({ line_seq: 0, profile: 'PL25x400', grade: 'SM520', part_mark: null, bom_part_ids: [] })
    expect(mail.log.mock.calls[0][0].subject).toBe('MO MO-26000077 created (DRAFT) · MO Part · source MATERIAL_LIST · file "ML.xls"')
  })
  it('rejects invalid lines with every message', async () => {
    const { svc } = make()
    const err = await svc.create({ ...INPUT, part_lines: [LINE, { ...LINE }] }, 1, 'tao').catch(e => e)
    expect(err).toBeInstanceOf(BadRequestException)
    expect(err.getResponse().message).toEqual(['Rows 1 and 2 are the same size (PL25x400 SM520 10550) — merge them'])
  })
  it('rejects an unknown source', async () => {
    const { svc } = make()
    await expect(svc.create({ ...INPUT, part_source: 'EMAIL' as any }, 1, 'tao')).rejects.toThrow(BadRequestException)
  })
  it('rejects bom_part_ids on a non-BOM source', async () => {
    const { svc } = make()
    await expect(svc.create({ ...INPUT, part_lines: [{ ...LINE, bom_part_ids: [1] }] }, 1, 'tao'))
      .rejects.toThrow(new BadRequestException('bom_part_ids are only allowed when part_source is BOM_PART_LIST'))
  })
  it('404s on a missing project / prefix / routing', async () => {
    const { svc } = make({ project: { findUnique: jest.fn().mockResolvedValue(null) } })
    await expect(svc.create(INPUT, 1, 'tao')).rejects.toThrow(NotFoundException)
  })
  it('caps a grouped part_mark at 60 chars', async () => {
    const { svc, tx } = make()
    await svc.create({ ...INPUT, part_source: 'BOM_PART_LIST', part_lines: [{ ...LINE, part_mark: 'C-f'.repeat(30), bom_part_ids: [1, 2] }] }, 1, 'tao')
    expect(tx.manufacturing_order.create.mock.calls[0][0].data.part_lines.create[0].part_mark).toHaveLength(60)
  })
})

describe('MoPartService.update', () => {
  const UPD = { primary_mark_prefix_code: 'OTH', routing_template_id: 3, part_lines: [{ ...LINE, qty: 8 }, { profile: 'PL20x115', grade: 'SM520', length_mm: 550, qty: 16, unit_weight_kg: 9.93 }] }
  function withMo(mo: unknown) {
    const m = make()
    ;(m.prisma as any).manufacturing_order = { findUnique: jest.fn().mockResolvedValue(mo) }
    ;(m.tx as any).mo_part_line = { deleteMany: jest.fn(), createMany: jest.fn() }
    ;(m.tx as any).manufacturing_order.update = jest.fn().mockResolvedValue({ id: 77, mo_code: 'MO-26000077' })
    return m
  }
  it('replaces the lines and header of a DRAFT PART MO and audits it', async () => {
    const { svc, tx, mail } = withMo({ id: 77, mo_code: 'MO-26000077', kind: 'PART', status: 'DRAFT', part_source: 'MATERIAL_LIST' })
    await expect(svc.update(77, UPD, 1)).resolves.toEqual({ id: 77, mo_code: 'MO-26000077' })
    expect((tx as any).mo_part_line.deleteMany).toHaveBeenCalledWith({ where: { mo_id: 77 } })
    const rows = (tx as any).mo_part_line.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ mo_id: 77, line_seq: 1, profile: 'PL20x115', bom_part_ids: [] })
    expect((tx as any).manufacturing_order.update.mock.calls[0][0].data).toMatchObject({ primary_mark_prefix_code: 'OTH', routing_template_id: 3, write_uid: 1 })
    expect(mail.log.mock.calls[0][0].subject).toBe('MO MO-26000077 edited · 2 part lines')
  })
  it('409s when the MO is not DRAFT', async () => {
    const { svc } = withMo({ id: 77, kind: 'PART', status: 'CONFIRMED', part_source: 'MANUAL' })
    await expect(svc.update(77, UPD, 1)).rejects.toThrow(new ConflictException('Only DRAFT MOs can be edited (current: CONFIRMED)'))
  })
  it('409s when the MO is an assembly MO', async () => {
    const { svc } = withMo({ id: 77, kind: 'ASSEMBLY', status: 'DRAFT' })
    await expect(svc.update(77, UPD, 1)).rejects.toThrow(new ConflictException('MO 77 is not an MO Part'))
  })
  it('rejects bom_part_ids when the MO did not start from BOM_PART_LIST', async () => {
    const { svc } = withMo({ id: 77, kind: 'PART', status: 'DRAFT', part_source: 'MANUAL' })
    await expect(svc.update(77, { ...UPD, part_lines: [{ ...LINE, bom_part_ids: [3] }] }, 1))
      .rejects.toThrow(new BadRequestException('bom_part_ids are only allowed when part_source is BOM_PART_LIST'))
  })
  it('404s on a missing MO', async () => {
    const { svc } = withMo(null)
    await expect(svc.update(77, UPD, 1)).rejects.toThrow(NotFoundException)
  })
})

describe('MoPartService.bomPartLines', () => {
  it('reads ACTIVE parts of the dispatch (optionally one slot) and groups them', async () => {
    const parts = [{ id: 1, part_mark: 'C-f1', profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 6, weight_kg: 828.17 }]
    const { svc, prisma } = make({ bom_part: { findMany: jest.fn().mockResolvedValue(parts) } })
    const r = await svc.bomPartLines(10, 'MAIN')
    expect(prisma.bom_part.findMany.mock.calls[0][0].where).toEqual({ dispatch_id: 10, status: 'ACTIVE', slot: 'MAIN' })
    expect(r.lines[0]).toMatchObject({ qty: 6, bom_part_ids: [1] })
  })
  it('404s on a missing dispatch', async () => {
    const { svc } = make({ bom_dispatch: { findUnique: jest.fn().mockResolvedValue(null) } })
    await expect(svc.bomPartLines(999)).rejects.toThrow(NotFoundException)
  })
})
