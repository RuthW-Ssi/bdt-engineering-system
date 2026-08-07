import { ConflictException, NotFoundException } from '@nestjs/common'
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
    const svc = new UsersService(prisma)
    await svc.create({ login: 'somchai', name: 'Somchai', password: 'ChangeMe2026!', role: 'BSC' })
    expect(bcryptjs.hash).toHaveBeenCalledWith('ChangeMe2026!', 12)
  })

  it('admin gets no permission rows at all', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma)
    await svc.create({ login: 'boss', name: 'Boss', password: 'ChangeMe2026!', role: 'admin' })
    expect(prisma.user_module_permission.createMany).not.toHaveBeenCalled()
  })

  it('a department with no pre-assigned template (BTE/BPD/BSC/BCD all start empty) gets no rows, not a crash', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma)
    await svc.create({ login: 'newdept', name: 'New Dept', password: 'ChangeMe2026!', role: 'BTE' })
    expect(prisma.user_module_permission.createMany).not.toHaveBeenCalled()
  })

  it('saves level and job_title alongside the department', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma)
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
      },
      select: expect.any(Object),
    })
  })

  it('explicit permissions override the role template', async () => {
    const prisma = makePrisma()
    const svc = new UsersService(prisma)
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
    const svc = new UsersService(prisma)
    await expect(
      svc.create({ login: 'admin', name: 'x', password: 'ChangeMe2026!', role: 'sale' }),
    ).rejects.toThrow(ConflictException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('UsersService.findOne', () => {
  it('throws NotFoundException when the user does not exist', async () => {
    const prisma = makePrisma({ res_users: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new UsersService(prisma)
    await expect(svc.findOne(999)).rejects.toThrow(NotFoundException)
  })
})

describe('UsersService.setPermissions', () => {
  it('deletes then recreates the full permission row set', async () => {
    const prisma = makePrisma({
      res_users: { findUnique: jest.fn().mockResolvedValue({ id: 1, login: 'somchai' }) },
    })
    const svc = new UsersService(prisma)
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
    const svc = new UsersService(prisma)
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
    const svc = new UsersService(prisma)
    await svc.resetPassword(1, { password: 'NewPassw0rd!' })
    expect(bcryptjs.hash).toHaveBeenCalledWith('NewPassw0rd!', 12)
    expect(prisma.res_users.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { password: 'HASHED' } })
  })
})
