import { PrismaService } from '../../prisma/prisma.service'
import { ALL_MODULES, ALWAYS_VIEW_MODULES, ModuleKey } from './permission-modules'
import { PermissionAction } from '../decorators/permission.decorator'

export interface ModulePermission {
  view: boolean
  create: boolean
  update: boolean
  delete: boolean
}

export async function getPermissionMap(
  prisma: PrismaService,
  userId: number,
  role: string,
): Promise<Record<string, ModulePermission>> {
  const admin = role === 'admin'
  const map: Record<string, ModulePermission> = Object.fromEntries(
    (ALL_MODULES as readonly ModuleKey[]).map((m) => [
      m,
      { view: admin || (ALWAYS_VIEW_MODULES as readonly string[]).includes(m), create: admin, update: admin, delete: admin },
    ]),
  )
  if (admin) return map

  const rows = await prisma.user_module_permission.findMany({ where: { user_id: userId } })
  for (const row of rows) {
    if ((ALL_MODULES as readonly string[]).includes(row.module)) {
      map[row.module] = {
        view: row.can_view || (ALWAYS_VIEW_MODULES as readonly string[]).includes(row.module),
        create: row.can_create,
        update: row.can_update,
        delete: row.can_delete,
      }
    }
  }
  return map
}

export async function hasPermission(
  prisma: PrismaService,
  userId: number,
  role: string,
  module: string,
  action: PermissionAction,
): Promise<boolean> {
  if (role === 'admin') return true
  if (action === 'view' && (ALWAYS_VIEW_MODULES as readonly string[]).includes(module)) return true
  const row = await prisma.user_module_permission.findUnique({
    where: { user_id_module: { user_id: userId, module } },
  })
  if (!row) return false
  switch (action) {
    case 'view':
      return row.can_view
    case 'create':
      return row.can_create
    case 'update':
      return row.can_update
    case 'delete':
      return row.can_delete
  }
}
