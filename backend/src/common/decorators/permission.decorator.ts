import { SetMetadata } from '@nestjs/common'

export type PermissionAction = 'view' | 'create' | 'update' | 'delete'

export interface PermissionRequirement {
  module: string
  action: PermissionAction
}

export const PERMISSION_KEY = 'permission_requirement'
export const RequiresPermission = (module: string, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { module, action } as PermissionRequirement)
