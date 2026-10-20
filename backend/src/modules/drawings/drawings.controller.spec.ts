import { DrawingsController } from './drawings.controller'

// Pins the fix: the customer gate must come from DrawingsService.isCustomerUser
// (DB res_users.user_type), never the JWT's `role` claim — `role` is a
// free-text department/"admin" string and is never actually "customer".
describe('DrawingsController.findByZone', () => {
  function make(isCustomer: boolean) {
    const svc = {
      isCustomerUser: jest.fn().mockResolvedValue(isCustomer),
      findByZone: jest.fn().mockResolvedValue([]),
    }
    const ctrl = new DrawingsController(svc as any)
    return { ctrl, svc }
  }

  it('passes currentOnly: true when the DB says this user is a customer, regardless of JWT role', async () => {
    const { ctrl, svc } = make(true)

    await ctrl.findByZone({ zone_id: 7, sub_zone_id: undefined } as any, { sub: 9, login: 'x', role: 'engineer' })

    expect(svc.isCustomerUser).toHaveBeenCalledWith(9)
    expect(svc.findByZone).toHaveBeenCalledWith(7, null, { currentOnly: true })
  })

  it('passes currentOnly: false for a non-customer DB user even if the JWT role string happens to read "customer"', async () => {
    const { ctrl, svc } = make(false)

    await ctrl.findByZone({ zone_id: 7, sub_zone_id: undefined } as any, { sub: 9, login: 'x', role: 'customer' })

    expect(svc.findByZone).toHaveBeenCalledWith(7, null, { currentOnly: false })
  })
})
