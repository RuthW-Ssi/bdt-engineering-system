import { TemplateBindingService } from './template-binding.service'

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    products: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    routing_template_binding_rule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as any
}

const BASE_PRODUCT = {
  id: 1,
  product_type: 'custom',
  categ_id: 10,
  attributes: {},
  has_custom_routing: false,
  mark_prefix: 'WH',
}

const RULE_ANY = { id: 1, priority: 10, active: true, routing_template_id: 99, match_product_type: null, match_categ_id: null, match_mark_prefix: null, match_attr_path: null, match_attr_value: null }
const RULE_TYPE = { ...RULE_ANY, id: 2, priority: 20, routing_template_id: 77, match_product_type: 'custom' }
const RULE_CATEG = { ...RULE_ANY, id: 3, priority: 30, routing_template_id: 55, match_categ_id: 10 }
const RULE_PREFIX = { ...RULE_ANY, id: 4, priority: 40, routing_template_id: 44, match_mark_prefix: 'WH' }
const RULE_ATTR = { ...RULE_ANY, id: 5, priority: 50, routing_template_id: 33, match_attr_path: 'grade', match_attr_value: 'A36' }

describe('TemplateBindingService', () => {
  let svc: TemplateBindingService

  describe('bindProduct', () => {
    it('returns null immediately when has_custom_routing=true', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...BASE_PRODUCT, has_custom_routing: true })
      svc = new TemplateBindingService(prisma)

      const result = await svc.bindProduct(1)
      expect(result).toBeNull()
      expect(prisma.routing_template_binding_rule.findMany).not.toHaveBeenCalled()
    })

    it('returns null when no rules match', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue(BASE_PRODUCT)
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([
        { ...RULE_TYPE, match_product_type: 'make_to_order' },
      ])
      svc = new TemplateBindingService(prisma)

      const result = await svc.bindProduct(1)
      expect(result).toBeNull()
      expect(prisma.products.update).not.toHaveBeenCalled()
    })

    it('matches first rule by priority (first-match wins)', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue(BASE_PRODUCT)
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([RULE_ANY, RULE_TYPE])
      svc = new TemplateBindingService(prisma)

      const result = await svc.bindProduct(1)
      expect(result).toBe(99) // RULE_ANY wins
      expect(prisma.products.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { routing_template_id: 99 },
      })
    })

    it('matches match_product_type rule', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue(BASE_PRODUCT)
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([RULE_TYPE])
      svc = new TemplateBindingService(prisma)

      const result = await svc.bindProduct(1)
      expect(result).toBe(77)
    })

    it('skips when match_product_type does not match', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...BASE_PRODUCT, product_type: 'material' })
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([RULE_TYPE])
      svc = new TemplateBindingService(prisma)

      expect(await svc.bindProduct(1)).toBeNull()
    })

    it('matches match_categ_id rule', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue(BASE_PRODUCT)
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([RULE_CATEG])
      svc = new TemplateBindingService(prisma)

      expect(await svc.bindProduct(1)).toBe(55)
    })

    it('matches match_mark_prefix rule', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue(BASE_PRODUCT)
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([RULE_PREFIX])
      svc = new TemplateBindingService(prisma)

      expect(await svc.bindProduct(1)).toBe(44)
    })

    it('matches match_attr_path/value rule', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...BASE_PRODUCT, attributes: { grade: 'A36' } })
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([RULE_ATTR])
      svc = new TemplateBindingService(prisma)

      expect(await svc.bindProduct(1)).toBe(33)
    })

    it('is idempotent — re-bind same product updates with same template', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUniqueOrThrow as jest.Mock).mockResolvedValue(BASE_PRODUCT)
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock).mockResolvedValue([RULE_TYPE])
      svc = new TemplateBindingService(prisma)

      await svc.bindProduct(1)
      await svc.bindProduct(1)

      expect(prisma.products.update).toHaveBeenCalledTimes(2)
      expect(prisma.products.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { routing_template_id: 77 } })
    })
  })

  describe('rebindAll', () => {
    it('returns bound/unmatched counts', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findMany as jest.Mock).mockResolvedValue([{ id: 1 }, { id: 2 }])
      ;(prisma.products.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce(BASE_PRODUCT)
        .mockResolvedValueOnce({ ...BASE_PRODUCT, id: 2 })
      ;(prisma.routing_template_binding_rule.findMany as jest.Mock)
        .mockResolvedValueOnce([RULE_TYPE])
        .mockResolvedValueOnce([])
      svc = new TemplateBindingService(prisma)

      const result = await svc.rebindAll()
      expect(result).toEqual({ bound: 1, unmatched: 1 })
    })
  })
})
