import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { ScheduleController } from './schedule.controller'

const proto = ScheduleController.prototype

describe('ScheduleController guards', () => {
  it('keeps JwtAuthGuard at class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ScheduleController)).toEqual([JwtAuthGuard])
  })

  it.each(['run', 'activate'] as const)('%s requires orders:update via a method-level PermissionGuard', (method) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toEqual({ module: 'orders', action: 'update' })
    expect(Reflect.getMetadata(GUARDS_METADATA, proto[method])).toEqual([PermissionGuard])
  })

  it.each(['listVersions', 'activeVersion'] as const)('GET %s stays ungated', (method) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toBeUndefined()
    expect(Reflect.getMetadata(GUARDS_METADATA, proto[method])).toBeUndefined()
  })
})
