import { ConflictException, NotFoundException } from '@nestjs/common'
import { RoutingsController } from './routings.controller'

// DELETE /routing-templates/:id — products are ON DELETE SET NULL (a delete would silently
// unbind them); binding rules / MOs are ON DELETE RESTRICT (a delete would be a raw 500).
describe('RoutingsController.deleteRoutingTemplate', () => {
  function make(counts: { bound_products?: number; binding_rules?: number; manufacturing_orders?: number } | null) {
    const prisma = {
      routing_template: {
        findUnique: jest.fn().mockResolvedValue(
          counts && { id: 5, _count: { bound_products: 0, binding_rules: 0, manufacturing_orders: 0, ...counts } },
        ),
        delete: jest.fn().mockResolvedValue({ id: 5 }),
      },
    }
    const none = {} as never
    const ctrl = new RoutingsController(prisma as never, none, none, none, none, none, none)
    return { ctrl, prisma }
  }

  it('deletes an unused template', async () => {
    const { ctrl, prisma } = make({})
    await expect(ctrl.deleteRoutingTemplate(5)).resolves.toEqual({ deleted: true })
    expect(prisma.routing_template.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { id: true, _count: { select: { bound_products: true, binding_rules: true, manufacturing_orders: true } } },
    })
    expect(prisma.routing_template.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it('404s when the template does not exist', async () => {
    const { ctrl, prisma } = make(null)
    await expect(ctrl.deleteRoutingTemplate(5)).rejects.toThrow(NotFoundException)
    expect(prisma.routing_template.delete).not.toHaveBeenCalled()
  })

  it.each([
    [{ bound_products: 3 }, '3 product(s)'],
    [{ binding_rules: 2 }, '2 binding rule(s)'],
    [{ manufacturing_orders: 1 }, '1 manufacturing order(s)'],
  ])('409s and keeps the template while it is used: %j', async (counts, phrase) => {
    const { ctrl, prisma } = make(counts)
    const err = await ctrl.deleteRoutingTemplate(5).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictException)
    expect(err.message).toContain(phrase)
    expect(prisma.routing_template.delete).not.toHaveBeenCalled()
  })

  it('lists every kind of use in one message', async () => {
    const { ctrl } = make({ bound_products: 1, binding_rules: 1, manufacturing_orders: 2 })
    const err = await ctrl.deleteRoutingTemplate(5).catch((e) => e)
    expect(err.message).toBe(
      'Cannot delete: this routing template is used by 1 product(s), 1 binding rule(s), 2 manufacturing order(s). Rebind or remove them first.',
    )
  })
})
