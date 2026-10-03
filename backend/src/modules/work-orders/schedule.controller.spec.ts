import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { ScheduleController } from './schedule.controller'
import { ScheduleBoardQueryDto } from './dto/schedule-board-query.dto'

const proto = ScheduleController.prototype

describe('ScheduleController guards', () => {
  it('keeps JwtAuthGuard at class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ScheduleController)).toEqual([JwtAuthGuard])
  })

  it.each(['run', 'activate'] as const)('%s requires orders:update via a method-level PermissionGuard', (method) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toEqual({ module: 'orders', action: 'update' })
    expect(Reflect.getMetadata(GUARDS_METADATA, proto[method])).toEqual([PermissionGuard])
  })

  it('GET board requires orders:view via a method-level PermissionGuard', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.board)).toEqual({ module: 'orders', action: 'view' })
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.board)).toEqual([PermissionGuard])
  })

  it.each(['listVersions', 'activeVersion'] as const)('GET %s stays ungated', (method) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toBeUndefined()
    expect(Reflect.getMetadata(GUARDS_METADATA, proto[method])).toBeUndefined()
  })
})

describe('GET /schedule/board query', () => {
  // Same options as the global pipe in main.ts.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true })
  const parse = (query: Record<string, string>) =>
    pipe.transform(query, { type: 'query', metatype: ScheduleBoardQueryDto }) as Promise<ScheduleBoardQueryDto>

  it('leaves version_id undefined when absent', async () => {
    expect((await parse({})).version_id).toBeUndefined()
  })

  it('parses an integer version_id', async () => {
    expect((await parse({ version_id: '7' })).version_id).toBe(7)
  })

  it.each(['abc', '1.5'])('rejects version_id=%s with 400', async (raw) => {
    await expect(parse({ version_id: raw })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('passes version_id through to the service', async () => {
    const svc = { board: jest.fn().mockResolvedValue({}) }
    const ctrl = new ScheduleController(svc as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    await ctrl.board({ version_id: 7 })
    await ctrl.board({})
    expect(svc.board.mock.calls).toEqual([[7], [undefined]])
  })
})
