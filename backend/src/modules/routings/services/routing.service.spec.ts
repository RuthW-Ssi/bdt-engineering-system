import { RoutingService } from './routing.service'

const mailStub = { log: jest.fn() } as unknown as any

function makeTemplateRow(id: number, code: string, appliesTo: string | null) {
  return {
    id,
    code,
    name: code,
    state: 'active',
    applies_to_product_type: appliesTo,
    write_date: new Date('2026-01-01T00:00:00Z'),
    _count: { operations: 0, bound_products: 0 },
  }
}

function makePrisma(templateRows: unknown[]) {
  return {
    routing_template_binding_rule: { findMany: jest.fn().mockResolvedValue([]) },
    routing_template: { findMany: jest.fn().mockResolvedValue(templateRows) },
  } as unknown as any
}

describe('RoutingService', () => {
  describe('suggestByMarkPrefix', () => {
    it('suggests a template with applies_to_product_type=ALL regardless of the mark prefix queried', async () => {
      const prisma = makePrisma([makeTemplateRow(1, 'RT-ALL', 'ALL')])
      const svc = new RoutingService(prisma, mailStub)

      const forCO = await svc.suggestByMarkPrefix('CO')
      const forFB = await svc.suggestByMarkPrefix('FB')

      expect(forCO.suggested.map((t) => t.id)).toEqual([1])
      expect(forFB.suggested.map((t) => t.id)).toEqual([1])
    })

    it('leaves normal exact-match templates unaffected — only matches its own prefix', async () => {
      const prisma = makePrisma([
        makeTemplateRow(1, 'RT-CO', 'CO'),
        makeTemplateRow(2, 'RT-PS', 'PS'),
      ])
      const svc = new RoutingService(prisma, mailStub)

      const result = await svc.suggestByMarkPrefix('CO')

      expect(result.suggested.map((t) => t.id)).toEqual([1])
      expect(result.others.map((t) => t.id)).toEqual([2])
    })

    it('combines an ALL template with an exact-match template, keeping unrelated prefixes in others', async () => {
      const prisma = makePrisma([
        makeTemplateRow(1, 'RT-CO', 'CO'),
        makeTemplateRow(2, 'RT-ALL', 'ALL'),
        makeTemplateRow(3, 'RT-PS', 'PS'),
      ])
      const svc = new RoutingService(prisma, mailStub)

      const result = await svc.suggestByMarkPrefix('CO')

      expect(result.suggested.map((t) => t.id).sort()).toEqual([1, 2])
      expect(result.others.map((t) => t.id)).toEqual([3])
    })
  })

  describe('upsertTemplateSnapshot', () => {
    it('persists applies_to_product_type=ALL on an existing template', async () => {
      const routingTemplateUpdate = jest.fn().mockResolvedValue({})
      const tx = {
        mrp_routing_workcenter: {
          deleteMany: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({}),
        },
        routing_template: { update: routingTemplateUpdate },
      }
      const prisma = {
        routing_template: { findUnique: jest.fn().mockResolvedValue({ id: 10, state: 'active' }) },
        activity_skill: { findMany: jest.fn().mockResolvedValue([]) },
        activity: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      } as unknown as any
      const svc = new RoutingService(prisma, mailStub)

      const dto = {
        name: 'Existing Template',
        applies_to_product_type: 'ALL',
        canvas_edges: [],
        operations: [],
      } as any

      await svc.upsertTemplateSnapshot(10, dto, 1)

      expect(routingTemplateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({ applies_to_product_type: 'ALL' }),
        }),
      )
    })
  })
})
