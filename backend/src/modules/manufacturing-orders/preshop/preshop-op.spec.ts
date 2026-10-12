import { opBelongsToMo, PRESHOP_TEMPLATE_CODE } from './preshop-op'

const client = (isSystem: boolean) => ({ routing_template: { findFirst: jest.fn().mockResolvedValue(isSystem ? { id: 99 } : null) } })

describe('opBelongsToMo', () => {
  it('accepts an op of the MO routing', async () => {
    const c = client(false)
    await expect(opBelongsToMo(c as any, { template_id: 7 }, { routing_template_id: 7, shop_type: 'FULL_SHOP' })).resolves.toBe(true)
    expect(c.routing_template.findFirst).not.toHaveBeenCalled()
  })
  it('accepts op 000 (system SYS-PRESHOP) on a PRE_SHOP MO only', async () => {
    const c = client(true)
    await expect(opBelongsToMo(c as any, { template_id: 99 }, { routing_template_id: 7, shop_type: 'PRE_SHOP' })).resolves.toBe(true)
    expect(c.routing_template.findFirst.mock.calls[0][0].where).toEqual({ id: 99, code: PRESHOP_TEMPLATE_CODE })
    await expect(opBelongsToMo(c as any, { template_id: 99 }, { routing_template_id: 7, shop_type: 'FULL_SHOP' })).resolves.toBe(false)
  })
  it('rejects another routing op on a PRE_SHOP MO', async () => {
    await expect(opBelongsToMo(client(false) as any, { template_id: 8 }, { routing_template_id: 7, shop_type: 'PRE_SHOP' })).resolves.toBe(false)
  })
})
