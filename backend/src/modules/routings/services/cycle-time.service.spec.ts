import { BadRequestException } from '@nestjs/common'
import { CycleTimeService } from './cycle-time.service'
import { FormulaService } from './formula.service'

const FORMULA_SVC = new FormulaService()

function makeOp(id: number, cacheKey: string | null, timeCycle: number, activities: unknown[]) {
  return {
    id,
    op_code: `op_${id}`,
    sequence: id * 10,
    cache_key: cacheKey,
    time_cycle: String(timeCycle),
    workcenter: { code: 'WC-BU', name: 'Built Up' },
    op_activities: activities,
  }
}

function makeActivity(id: number, expr: string, perMin = 10, stdMeasure = 5, manpower = 1) {
  return {
    activity_template_id: id,
    sequence: id * 10,
    activity_template: {
      id,
      description: `Activity ${id}`,
      formula_param_code: 'test_param',
      per_minute: perMin,
      std_measure: stdMeasure,
      manpower,
      formula_param: { code: 'test_param', formula_expression: expr },
    },
  }
}

function makePrisma(product: unknown, ops: unknown[], overrides: unknown[] = [], customRouting: unknown = null) {
  return {
    products: { findUnique: jest.fn().mockResolvedValue(product) },
    mrp_routing_workcenter: {
      findMany: jest.fn().mockResolvedValue(ops),
      update: jest.fn().mockResolvedValue({}),
    },
    product_routing_override: { findMany: jest.fn().mockResolvedValue(overrides) },
    custom_routing: { findUnique: jest.fn().mockResolvedValue(customRouting) },
  } as unknown as any
}

describe('CycleTimeService', () => {
  it('throws BadRequestException for unbound product', async () => {
    const prisma = makePrisma({ id: 1, attributes: {}, routing_template_id: null, has_custom_routing: false }, [])
    const svc = new CycleTimeService(prisma, FORMULA_SVC)
    await expect(svc.compute(1)).rejects.toThrow(BadRequestException)
  })

  it('template path — computes cycle time from formula', async () => {
    const op = makeOp(1, null, 0, [makeActivity(1, '1', 5, 1, 1)])
    const prisma = makePrisma({ id: 1, attributes: {}, routing_template_id: 4, has_custom_routing: false }, [op])
    const svc = new CycleTimeService(prisma, FORMULA_SVC)

    const result = await svc.compute(1, true)
    expect(result.operations[0].total_cycle_time_min).toBe(5)
    expect(result.total_cycle_time_min).toBe(5)
  })

  it('template path — merges override per_minute before formula eval', async () => {
    const op = makeOp(1, null, 0, [makeActivity(1, '1', 10, 1, 1)])
    const override = { activity_template_id: 1, override_per_minute: '20', override_std_measure: null, override_manpower: null }
    const prisma = makePrisma({ id: 1, attributes: {}, routing_template_id: 4, has_custom_routing: false }, [op], [override])
    const svc = new CycleTimeService(prisma, FORMULA_SVC)

    const result = await svc.compute(1, true)
    expect(result.operations[0].activities[0].per_minute).toBe(20)
    expect(result.operations[0].activities[0].cycle_time_min).toBe(20)
  })

  it('template path — cache hit skips formula eval when force=false', async () => {
    const cacheKey = '1_1_e3b0c44298fc1c149afbf4c8996fb924'
    const op = { ...makeOp(1, null, 0, [makeActivity(1, '1', 10, 1, 1)]) }

    const prisma = makePrisma({ id: 1, attributes: {}, routing_template_id: 4, has_custom_routing: false }, [op])
    const svc = new CycleTimeService(prisma, FORMULA_SVC)

    const firstResult = await svc.compute(1, true)
    expect(prisma.mrp_routing_workcenter.update).toHaveBeenCalled()
    const savedCache = (prisma.mrp_routing_workcenter.update as jest.Mock).mock.calls[0][0].data.cache_key

    const op2 = { ...op, cache_key: savedCache, time_cycle: String(firstResult.operations[0].total_cycle_time_min) }
    const prisma2 = makePrisma({ id: 1, attributes: {}, routing_template_id: 4, has_custom_routing: false }, [op2])
    const svc2 = new CycleTimeService(prisma2, FORMULA_SVC)

    await svc2.compute(1, false)
    expect(prisma2.mrp_routing_workcenter.update).not.toHaveBeenCalled()
  })

  it('template path — force=true bypasses cache', async () => {
    const op = makeOp(1, 'some-stale-key', 999, [makeActivity(1, '1', 5, 1, 1)])
    const prisma = makePrisma({ id: 1, attributes: {}, routing_template_id: 4, has_custom_routing: false }, [op])
    const svc = new CycleTimeService(prisma, FORMULA_SVC)

    const result = await svc.compute(1, true)
    expect(result.operations[0].total_cycle_time_min).toBe(5)
    expect(prisma.mrp_routing_workcenter.update).toHaveBeenCalled()
  })

  it('custom_routing path — computes from custom ops', async () => {
    const customRouting = {
      id: 1,
      ops: [{
        id: 10,
        op_code: 'custom_op',
        sequence: 10,
        workcenter: { code: 'WC-BU', name: 'Built Up' },
        activities: [{
          id: 100,
          sequence: 10,
          description: 'Custom activity',
          per_minute: 8,
          std_measure: 2,
          manpower: 1,
          formula_param_code: 'per unit',
          formula_param: { code: 'per unit', formula_expression: '1' },
        }],
      }],
    }
    const prisma = makePrisma(
      { id: 1, attributes: {}, routing_template_id: null, has_custom_routing: true },
      [],
      [],
      customRouting,
    )
    const svc = new CycleTimeService(prisma, FORMULA_SVC)

    const result = await svc.compute(1, false)
    expect(result.operations[0].op_code).toBe('custom_op')
    // per_minute=8, std_measure=2, formula=1 → ratio=ceil(1/2)=1 → 1*8*1=8
    expect(result.operations[0].total_cycle_time_min).toBe(8)
    expect(result.total_cycle_time_min).toBe(8)
  })
})
