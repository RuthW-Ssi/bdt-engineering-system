import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import * as bcryptjs from 'bcryptjs'
import { UsersService } from './users.service'

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('HASHED') }))

/* eslint-disable @typescript-eslint/no-explicit-any */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const base: any = {
    res_users: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1, login: 'somchai', name: 'Somchai', email: null, role: 'BSC', active: true, create_date: new Date() }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
    user_module_permission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  }
  base.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(base))
  return base as any
}

describe('UsersService.create', () => {
  it('hashes the password when creating a user', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.create({ login: 'somchai', name: 'Somchai', password: 'ChangeMe2026!', role: 'BSC' })
    expect(bcryptjs.hash).toHaveBeenCalledWith('ChangeMe2026!', 12)
  })

  it('admin gets no permission rows at all', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.create({ login: 'boss', name: 'Boss', password: 'ChangeMe2026!', role: 'admin' })
    expect(prisma.user_module_permission.createMany).not.toHaveBeenCalled()
  })

  it('a department with no pre-assigned template (BTE/BDP/BSC/BCD all start empty) gets no rows, not a crash', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.create({ login: 'newdept', name: 'New Dept', password: 'ChangeMe2026!', role: 'BTE' })
    expect(prisma.user_module_permission.createMany).not.toHaveBeenCalled()
  })

  it('saves level and job_title alongside the department', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.create({
      login: 'somchai',
      name: 'Somchai',
      password: 'ChangeMe2026!',
      role: 'BTE',
      level: 'Supervisor',
      job_title: 'Business System Developer',
    })
    expect(prisma.res_users.create).toHaveBeenCalledWith({
      data: {
        login: 'somchai',
        name: 'Somchai',
        password: 'HASHED',
        role: 'BTE',
        level: 'Supervisor',
        job_title: 'Business System Developer',
        user_type: 'employee',
        partner_id: null,
      },
      select: expect.any(Object),
    })
  })

  it('explicit permissions override the role template', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.create({
      login: 'somchai',
      name: 'Somchai',
      password: 'ChangeMe2026!',
      role: 'BSC',
      permissions: [{ module: 'boms', can_view: true, can_create: true, can_update: true, can_delete: false }],
    })
    expect(prisma.user_module_permission.createMany).toHaveBeenCalledWith({
      data: [{ user_id: 1, module: 'boms', can_view: true, can_create: true, can_update: true, can_delete: false }],
      skipDuplicates: true,
    })
  })

  it('rejects a duplicate login before touching the transaction', async () => {
    const prisma = makePrisma({ res_users: { findUnique: jest.fn().mockResolvedValue({ id: 9 }) } })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await expect(
      svc.create({ login: 'admin', name: 'x', password: 'ChangeMe2026!', role: 'sale' }),
    ).rejects.toThrow(ConflictException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('UsersService.findOne', () => {
  it('throws NotFoundException when the user does not exist', async () => {
    const prisma = makePrisma({ res_users: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await expect(svc.findOne(999)).rejects.toThrow(NotFoundException)
  })
})

describe('UsersService.setPermissions', () => {
  it('deletes then recreates the full permission row set', async () => {
    const prisma = makePrisma({
      res_users: { findUnique: jest.fn().mockResolvedValue({ id: 1, login: 'somchai' }) },
    })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.setPermissions(1, {
      permissions: [
        { module: 'boms', can_view: true, can_create: true, can_update: true, can_delete: true },
        { module: 'drawings', can_view: true, can_create: false, can_update: true, can_delete: false },
      ],
    })
    expect(prisma.user_module_permission.deleteMany).toHaveBeenCalledWith({ where: { user_id: 1 } })
    expect(prisma.user_module_permission.createMany).toHaveBeenCalledWith({
      data: [
        { user_id: 1, module: 'boms', can_view: true, can_create: true, can_update: true, can_delete: true },
        { user_id: 1, module: 'drawings', can_view: true, can_create: false, can_update: true, can_delete: false },
      ],
      skipDuplicates: true,
    })
  })

  it('an empty permission list just clears all rows (no createMany call)', async () => {
    const prisma = makePrisma({
      res_users: { findUnique: jest.fn().mockResolvedValue({ id: 1, login: 'somchai' }) },
    })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.setPermissions(1, { permissions: [] })
    expect(prisma.user_module_permission.deleteMany).toHaveBeenCalledWith({ where: { user_id: 1 } })
    expect(prisma.user_module_permission.createMany).not.toHaveBeenCalled()
  })
})

describe('UsersService.resetPassword', () => {
  it('hashes the new password before saving', async () => {
    const prisma = makePrisma({
      res_users: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, login: 'somchai' }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
    })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.resetPassword(1, { password: 'NewPassw0rd!' })
    expect(bcryptjs.hash).toHaveBeenCalledWith('NewPassw0rd!', 12)
    expect(prisma.res_users.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { password: 'HASHED' } })
  })
})

describe('UsersService customer users', () => {
  const base = { login: 'cust', name: 'Cust', password: 'ChangeMe2026!', role: 'admin' }

  it('rejects a customer without a company', async () => {
    const svc = new UsersService(makePrisma(), { log: jest.fn() } as any)
    await expect(svc.create({ ...base, user_type: 'customer' })).rejects.toThrow(BadRequestException)
  })

  it('rejects a customer linked to a missing company', async () => {
    const svc = new UsersService(makePrisma({ res_partner: { findUnique: jest.fn().mockResolvedValue(null) } }), { log: jest.fn() } as any)
    await expect(svc.create({ ...base, user_type: 'customer', partner_id: 99 })).rejects.toThrow(BadRequestException)
  })

  it('forces role "customer" and view-only grants, ignoring requested role/permissions', async () => {
    const prisma = makePrisma({ res_partner: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) } })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.create({
      ...base,
      user_type: 'customer',
      partner_id: 7,
      permissions: [{ module: 'boms', can_view: true, can_create: true, can_update: true, can_delete: true }],
    })
    const data = prisma.res_users.create.mock.calls[0][0].data
    expect(data).toMatchObject({ role: 'customer', user_type: 'customer', partner_id: 7 })
    const rows = prisma.user_module_permission.createMany.mock.calls[0][0].data
    expect(rows.map((r: { module: string }) => r.module).sort()).toEqual(
      ['bim', 'project-tracking', 'project-zones', 'projects', 'sub-zones'],
    )
    expect(rows.every((r: any) => r.can_view && !r.can_create && !r.can_update && !r.can_delete)).toBe(true)
  })

  it('switching an employee to customer replaces their grants with the view-only set', async () => {
    const prisma = makePrisma({ res_partner: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) } })
    prisma.res_users.findUnique.mockResolvedValue({ id: 3, user_type: 'employee', partner_id: null })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.update(3, { user_type: 'customer', partner_id: 7, role: 'admin' })
    expect(prisma.user_module_permission.deleteMany).toHaveBeenCalledWith({ where: { user_id: 3 } })
    expect(prisma.res_users.update.mock.calls[0][0].data).toMatchObject({ role: 'customer', user_type: 'customer', partner_id: 7 })
  })

  it('switching back to employee clears the company link', async () => {
    const prisma = makePrisma()
    prisma.res_users.findUnique.mockResolvedValue({ id: 3, user_type: 'customer', partner_id: 7 })
    const svc = new UsersService(prisma, { log: jest.fn() } as any)
    await svc.update(3, { user_type: 'employee', role: 'BTE' })
    expect(prisma.res_users.update.mock.calls[0][0].data).toMatchObject({ role: 'BTE', user_type: 'employee', partner_id: null })
  })
})

// Login lockout (2026-11-05): admin unlock clears everything and is audited (QA M3)
describe('UsersService.unlockLogin', () => {
  const blockedAt = new Date('2026-11-05T08:00:00Z')
  function make(user: unknown) {
    const prisma: any = { res_users: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() } }
    const mail = { log: jest.fn() }
    return { svc: new UsersService(prisma, mail as any), prisma, mail }
  }

  it('clears the block, the running lock and both counters, and audits who did it', async () => {
    const { svc, prisma, mail } = make({ id: 39, login: 'locktest', login_blocked_at: blockedAt, login_locked_until: null })
    await expect(svc.unlockLogin(39, 1)).resolves.toEqual({ ok: true })
    expect(prisma.res_users.update).toHaveBeenCalledWith({
      where: { id: 39 },
      data: { failed_login_count: 0, login_strikes: 0, login_locked_until: null, login_blocked_at: null },
    })
    expect(mail.log).toHaveBeenCalledWith(expect.objectContaining({
      model: 'res_users', res_id: 39, message_type: 'audit', author_id: 1,
      tracking: expect.arrayContaining([{ field: 'login_blocked_at', old_value: blockedAt.toISOString(), new_value: null }]),
    }))
  })

  it('404s for an unknown user and writes nothing', async () => {
    const { svc, prisma, mail } = make(null)
    await expect(svc.unlockLogin(999, 1)).rejects.toThrow(NotFoundException)
    expect(prisma.res_users.update).not.toHaveBeenCalled()
    expect(mail.log).not.toHaveBeenCalled()
  })
})
