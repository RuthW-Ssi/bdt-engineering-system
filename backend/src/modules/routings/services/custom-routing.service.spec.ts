import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { CustomRoutingService } from './custom-routing.service'

const UID = 1

const PRODUCT = { id: 13, product_code: 'CUS-00001', routing_template_id: 4, has_custom_routing: false }
const PRODUCT_CUSTOM = { ...PRODUCT, has_custom_routing: true, routing_template_id: null }
const CUSTOM_ROUTING = { id: 1, product_id: 13, name: 'Custom routing — CUS-00001', state: 'draft' }
const TEMPLATE = { id: 4, code: 'Main', name: 'Main Template', state: 'active' }
const TEMPLATE_OP = {
  id: 10, sequence: 10, name: 'Built Up Fit', op_code: 'buildup_fit', workcenter_id: 1,
  op_activities: [
    {
      sequence: 10,
      activity_template: {
        id: 1, description: 'Lift to jig', per_minute: 10, formula_param_code: 'buildup_weight',
        std_measure: 500, unit: 'kg', manpower: 1, workcenter_id: 1,
      },
    },
  ],
}

function makePrisma() {
  return {
    products: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    custom_routing: {
      create: jest.fn().mockResolvedValue(CUSTOM_ROUTING),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    custom_routing_op: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 10 } }),
    },
    custom_routing_activity: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 10 } }),
    },
    mrp_routing_workcenter: { findMany: jest.fn().mockResolvedValue([]) },
    routing_template: { findUnique: jest.fn() },
  } as unknown as any
}

function makeMail() {
  return { log: jest.fn().mockResolvedValue({}) } as unknown as any
}

describe('CustomRoutingService', () => {
  let svc: CustomRoutingService

  describe('create', () => {
    it('creates a blank custom routing when fromTemplateId=undefined and no template bound', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue({ ...PRODUCT, routing_template_id: null })
      ;(prisma.custom_routing.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...CUSTOM_ROUTING, ops: [] })
      svc = new CustomRoutingService(prisma, makeMail())

      await svc.create('CUS-00001', undefined, UID)

      expect(prisma.custom_routing.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cloned_from_template_id: null }) }),
      )
      expect(prisma.mrp_routing_workcenter.findMany).not.toHaveBeenCalled()
    })

    it('clones template ops when fromTemplateId is provided', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT)
      ;(prisma.mrp_routing_workcenter.findMany as jest.Mock).mockResolvedValue([TEMPLATE_OP])
      ;(prisma.custom_routing_op.create as jest.Mock).mockResolvedValue({ id: 99 })
      ;(prisma.custom_routing.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...CUSTOM_ROUTING, ops: [] })
      svc = new CustomRoutingService(prisma, makeMail())

      await svc.create('CUS-00001', 4, UID)

      expect(prisma.mrp_routing_workcenter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { template_id: 4 } }),
      )
      expect(prisma.custom_routing_op.create).toHaveBeenCalled()
      expect(prisma.custom_routing_activity.create).toHaveBeenCalled()
    })

    it('sets has_custom_routing=true and clears routing_template_id', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT)
      ;(prisma.custom_routing.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...CUSTOM_ROUTING, ops: [] })
      svc = new CustomRoutingService(prisma, makeMail())

      await svc.create('CUS-00001', undefined, UID)

      expect(prisma.products.update).toHaveBeenCalledWith({
        where: { id: 13 },
        data: { has_custom_routing: true, routing_template_id: null },
      })
    })

    it('throws ConflictException when product already has custom routing', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      svc = new CustomRoutingService(prisma, makeMail())

      await expect(svc.create('CUS-00001', undefined, UID)).rejects.toThrow(ConflictException)
    })
  })

  describe('addOp', () => {
    it('creates op with auto-sequence', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      ;(prisma.custom_routing_op.create as jest.Mock).mockResolvedValue({ id: 2, sequence: 20 })
      svc = new CustomRoutingService(prisma, makeMail())

      await svc.addOp('CUS-00001', { name: 'Test Op', op_code: 'test', workcenter_id: 1 }, UID)

      expect(prisma.custom_routing_op.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sequence: 20, custom_routing_id: 1 }) }),
      )
    })
  })

  describe('updateOp', () => {
    it('updates op fields', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      ;(prisma.custom_routing_op.findFirst as jest.Mock).mockResolvedValue({ id: 5, custom_routing_id: 1 })
      ;(prisma.custom_routing_op.update as jest.Mock).mockResolvedValue({ id: 5, name: 'Updated' })
      svc = new CustomRoutingService(prisma, makeMail())

      const result = await svc.updateOp('CUS-00001', 5, { name: 'Updated' })
      expect(prisma.custom_routing_op.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } }),
      )
    })

    it('throws NotFoundException when op not found', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      ;(prisma.custom_routing_op.findFirst as jest.Mock).mockResolvedValue(null)
      svc = new CustomRoutingService(prisma, makeMail())

      await expect(svc.updateOp('CUS-00001', 999, { name: 'X' })).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteOp', () => {
    it('deletes op and returns {deleted:true}', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      ;(prisma.custom_routing_op.findFirst as jest.Mock).mockResolvedValue({ id: 5 })
      svc = new CustomRoutingService(prisma, makeMail())

      const result = await svc.deleteOp('CUS-00001', 5)
      expect(result).toEqual({ deleted: true })
      expect(prisma.custom_routing_op.delete).toHaveBeenCalledWith({ where: { id: 5 } })
    })
  })

  describe('addActivity', () => {
    it('creates activity under an op', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      ;(prisma.custom_routing_op.findFirst as jest.Mock).mockResolvedValue({ id: 5 })
      ;(prisma.custom_routing_activity.create as jest.Mock).mockResolvedValue({ id: 10 })
      svc = new CustomRoutingService(prisma, makeMail())

      await svc.addActivity('CUS-00001', 5, {
        description: 'New act', per_minute: 5, formula_param_code: 'per unit',
        std_measure: 1, unit: 'unit', workcenter_id: 1,
      })

      expect(prisma.custom_routing_activity.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ op_id: 5, description: 'New act' }) }),
      )
    })
  })

  describe('deleteActivity', () => {
    it('deletes activity and returns {deleted:true}', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      ;(prisma.custom_routing_op.findFirst as jest.Mock).mockResolvedValue({ id: 5 })
      ;(prisma.custom_routing_activity.findFirst as jest.Mock).mockResolvedValue({ id: 10 })
      svc = new CustomRoutingService(prisma, makeMail())

      const result = await svc.deleteActivity('CUS-00001', 5, 10)
      expect(result).toEqual({ deleted: true })
    })
  })

  describe('restoreToTemplate', () => {
    it('sets custom_routing state=obsolete', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.routing_template.findUnique as jest.Mock).mockResolvedValue(TEMPLATE)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      svc = new CustomRoutingService(prisma, makeMail())

      await svc.restoreToTemplate('CUS-00001', 4, UID)

      expect(prisma.custom_routing.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: 'obsolete' }) }),
      )
    })

    it('sets has_custom_routing=false and routing_template_id=templateId on restore', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.routing_template.findUnique as jest.Mock).mockResolvedValue(TEMPLATE)
      ;(prisma.custom_routing.findUnique as jest.Mock).mockResolvedValue(CUSTOM_ROUTING)
      svc = new CustomRoutingService(prisma, makeMail())

      await svc.restoreToTemplate('CUS-00001', 4, UID)

      expect(prisma.products.update).toHaveBeenCalledWith({
        where: { id: 13 },
        data: { has_custom_routing: false, routing_template_id: 4 },
      })
    })

    it('throws BadRequestException when product does not have custom routing', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT)
      svc = new CustomRoutingService(prisma, makeMail())

      await expect(svc.restoreToTemplate('CUS-00001', 4, UID)).rejects.toThrow(BadRequestException)
    })

    it('throws NotFoundException when template not found', async () => {
      const prisma = makePrisma()
      ;(prisma.products.findUnique as jest.Mock).mockResolvedValue(PRODUCT_CUSTOM)
      ;(prisma.routing_template.findUnique as jest.Mock).mockResolvedValue(null)
      svc = new CustomRoutingService(prisma, makeMail())

      await expect(svc.restoreToTemplate('CUS-00001', 999, UID)).rejects.toThrow(NotFoundException)
    })
  })
})
