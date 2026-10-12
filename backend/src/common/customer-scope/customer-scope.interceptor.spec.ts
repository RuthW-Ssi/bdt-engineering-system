import { ForbiddenException } from '@nestjs/common'
import { lastValueFrom, of } from 'rxjs'
import { CustomerScopeInterceptor } from './customer-scope.interceptor'
import type { CustomerAccessOptions } from './customer-accessible.decorator'

function run(opts: CustomerAccessOptions | undefined, method = 'GET', body: unknown = [{ title: 'Manual', write_date: 'x' }]) {
  const prisma = { res_users: { findUnique: jest.fn().mockResolvedValue({ user_type: 'customer', partner_id: 6 }) } }
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(opts) }
  const interceptor = new CustomerScopeInterceptor(reflector as never, {} as never, prisma as never)
  const req = { method, user: { sub: 36 }, params: {}, query: {}, headers: {} }
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => null,
    getClass: () => null,
  }
  return interceptor.intercept(ctx as never, { handle: () => of(body) }).then(lastValueFrom)
}

describe('CustomerScopeInterceptor — global routes (Document Center)', () => {
  it('lets a customer GET a global route without any project scope, dates stripped', async () => {
    await expect(run({ global: true })).resolves.toEqual([{ title: 'Manual' }])
  })

  it('still blocks writes on a global route', async () => {
    await expect(run({ global: true }, 'POST')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('still requires a project scope on non-global routes', async () => {
    await expect(run({})).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('still default-denies routes without @CustomerAccessible', async () => {
    await expect(run(undefined)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
