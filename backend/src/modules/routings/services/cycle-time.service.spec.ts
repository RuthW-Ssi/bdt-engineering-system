import { BadRequestException } from '@nestjs/common'
import { CycleTimeService } from './cycle-time.service'
import { FormulaService } from './formula.service'

// compute() since the S11 routing-chain drop (2026-06-08) + duration engine
// (2026-06-30): no formula eval, no cache, no per-product override, no custom
// routing. An op's time = sum of its activities' minutes, read from the linked
// operation template (source activity's duration_min first, else per_minute)
// or, with no template linked, from the op's activities_snapshot.

const WC = { code: 'WC-BU', name: 'Built Up' }

function makePrisma(product: unknown, ops: unknown[] = []) {
  return {
    products: { findUnique: jest.fn().mockResolvedValue(product) },
    mrp_routing_workcenter: { findMany: jest.fn().mockResolvedValue(ops) },
  } as unknown as any
}

const svcWith = (prisma: any) => new CycleTimeService(prisma, new FormulaService())

describe('CycleTimeService', () => {
  it('throws BadRequestException when the product does not exist', async () => {
    await expect(svcWith(makePrisma(null)).compute(1)).rejects.toThrow(BadRequestException)
  })

  it('returns an empty result (0 min) for a product with no routing template, without querying ops', async () => {
    const prisma = makePrisma({ id: 1, routing_template_id: null })
    const result = await svcWith(prisma).compute(1)
    expect(result).toMatchObject({ product_id: 1, operations: [], total_cycle_time_min: 0 })
    expect(prisma.mrp_routing_workcenter.findMany).not.toHaveBeenCalled()
  })

  it('template path — source activity duration_min wins over per_minute; manpower = sum of skill qty', async () => {
    const op = {
      id: 11, op_code: 'BU', workcenter: WC, operation_template_id: 7, activities_snapshot: null,
      operation_template: {
        activities: [
          { id: 1, name: 'Fit-up', per_minute: '99', source_activity: { id: 5, name: 'Fit-up', duration_min: '12.5' }, skills: [{ skill: 'fitter', qty: 2, level: 1 }, { skill: 'helper', qty: 1, level: 1 }] },
          { id: 2, name: 'Weld', per_minute: '30', source_activity: null, skills: [] },
        ],
      },
    }
    const prisma = makePrisma({ id: 1, routing_template_id: 4 }, [op])
    const result = await svcWith(prisma).compute(1)

    expect(prisma.mrp_routing_workcenter.findMany.mock.calls[0][0].where).toEqual({ template_id: 4 })
    expect(result.operations[0]).toMatchObject({
      routing_workcenter_id: 11, op_code: 'BU', workcenter_code: 'WC-BU', workcenter_name: 'Built Up', operation_template_id: 7,
      total_cycle_time_min: 42.5,
    })
    expect(result.operations[0].activities).toEqual([
      expect.objectContaining({ activity_template_id: 1, description: 'Fit-up', cycle_time_min: 12.5, manpower: 3, per_minute: 99 }),
      expect.objectContaining({ activity_template_id: 2, description: 'Weld', cycle_time_min: 30, manpower: 1, per_minute: 30 }),
    ])
  })

  it('snapshot path — no template linked: reads activities_snapshot (duration_min, else per_minute; manpower from labors)', async () => {
    const op = {
      id: 12, op_code: 'PT', workcenter: WC, operation_template_id: null, operation_template: null,
      activities_snapshot: [
        { source_activity_id: 8, name: 'Blast', duration_min: 20, per_minute: 5, labors: [{ qty: 2 }, { qty: 1 }] },
        { name: 'Paint', per_minute: 15 },
      ],
    }
    const result = await svcWith(makePrisma({ id: 1, routing_template_id: 4 }, [op])).compute(1)
    expect(result.operations[0].total_cycle_time_min).toBe(35)
    expect(result.operations[0].activities).toEqual([
      expect.objectContaining({ activity_template_id: 8, description: 'Blast', cycle_time_min: 20, manpower: 3 }),
      expect.objectContaining({ activity_template_id: 0, description: 'Paint', cycle_time_min: 15, manpower: 1 }),
    ])
  })

  it('sums every operation into total_cycle_time_min; an op with neither template nor snapshot counts 0', async () => {
    const ops = [
      { id: 1, op_code: 'A', workcenter: WC, operation_template_id: null, operation_template: null, activities_snapshot: [{ name: 'x', duration_min: 10 }] },
      { id: 2, op_code: 'B', workcenter: WC, operation_template_id: null, operation_template: null, activities_snapshot: null },
      { id: 3, op_code: 'C', workcenter: WC, operation_template_id: null, operation_template: null, activities_snapshot: [{ name: 'y', duration_min: 5 }] },
    ]
    const result = await svcWith(makePrisma({ id: 1, routing_template_id: 4 }, ops)).compute(1)
    expect(result.operations.map(o => [o.op_code, o.total_cycle_time_min])).toEqual([['A', 10], ['B', 0], ['C', 5]])
    expect(result.total_cycle_time_min).toBe(15)
  })
})
