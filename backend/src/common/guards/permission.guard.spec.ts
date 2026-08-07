import { ForbiddenException } from '@nestjs/common'
import { PermissionGuard } from './permission.guard'
import { PermissionRequirement } from '../decorators/permission.decorator'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeContext(user: { sub: number; role: string } | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any
}

function makeReflector(requirement: PermissionRequirement | undefined) {
  return { getAllAndOverride: jest.fn().mockReturnValue(requirement) } as any
}

function makePrisma(row: { can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean } | null) {
  return {
    user_module_permission: { findUnique: jest.fn().mockResolvedValue(row) },
  } as any
}

describe('PermissionGuard', () => {
  it('allows any request when the route carries no permission metadata', async () => {
    const guard = new PermissionGuard(makeReflector(undefined), makePrisma(null))
    await expect(guard.canActivate(makeContext({ sub: 1, role: 'BSC' }))).resolves.toBe(true)
  })

  it('admin bypasses the permission table entirely', async () => {
    const prisma = makePrisma(null)
    const guard = new PermissionGuard(makeReflector({ module: 'boms', action: 'create' }), prisma)
    await expect(guard.canActivate(makeContext({ sub: 1, role: 'admin' }))).resolves.toBe(true)
    expect(prisma.user_module_permission.findUnique).not.toHaveBeenCalled()
  })

  it('allows when a permission row grants the specific action requested', async () => {
    const guard = new PermissionGuard(
      makeReflector({ module: 'boms', action: 'update' }),
      makePrisma({ can_view: true, can_create: false, can_update: true, can_delete: false }),
    )
    await expect(guard.canActivate(makeContext({ sub: 2, role: 'BTE' }))).resolves.toBe(true)
  })

  it('rejects when the row exists but the specific action requested is false', async () => {
    const guard = new PermissionGuard(
      makeReflector({ module: 'boms', action: 'delete' }),
      makePrisma({ can_view: true, can_create: true, can_update: true, can_delete: false }),
    )
    await expect(guard.canActivate(makeContext({ sub: 2, role: 'BTE' }))).rejects.toThrow(ForbiddenException)
  })

  it('rejects when no permission row exists for the module at all', async () => {
    const guard = new PermissionGuard(makeReflector({ module: 'materials', action: 'create' }), makePrisma(null))
    await expect(guard.canActivate(makeContext({ sub: 2, role: 'BTE' }))).rejects.toThrow(ForbiddenException)
  })

  it('rejects view when the row exists but can_view is false — feature is fully blocked', async () => {
    const guard = new PermissionGuard(
      makeReflector({ module: 'boms', action: 'view' }),
      makePrisma({ can_view: false, can_create: true, can_update: true, can_delete: true }),
    )
    await expect(guard.canActivate(makeContext({ sub: 2, role: 'BTE' }))).rejects.toThrow(ForbiddenException)
  })

  it('allows view when the row grants can_view', async () => {
    const guard = new PermissionGuard(
      makeReflector({ module: 'boms', action: 'view' }),
      makePrisma({ can_view: true, can_create: false, can_update: false, can_delete: false }),
    )
    await expect(guard.canActivate(makeContext({ sub: 2, role: 'BTE' }))).resolves.toBe(true)
  })

  it('always-view modules (customers/projects/project-zones/sub-zones, re-added 2026-08-03) allow view with no row at all', async () => {
    const prisma = makePrisma(null)
    const guard = new PermissionGuard(makeReflector({ module: 'project-zones', action: 'view' }), prisma)
    await expect(guard.canActivate(makeContext({ sub: 2, role: 'BTE' }))).resolves.toBe(true)
    expect(prisma.user_module_permission.findUnique).not.toHaveBeenCalled()
  })

  it('always-view modules still gate create/update/delete normally', async () => {
    const guard = new PermissionGuard(makeReflector({ module: 'customers', action: 'create' }), makePrisma(null))
    await expect(guard.canActivate(makeContext({ sub: 2, role: 'BTE' }))).rejects.toThrow(ForbiddenException)
  })
})
