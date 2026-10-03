import { BadRequestException, INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import * as request from 'supertest'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { ScheduleController } from './schedule.controller'
import { ScheduleService } from './schedule.service'
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

  it.each(['board', 'fourm'] as const)('GET %s requires orders:view via a method-level PermissionGuard', (method) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toEqual({ module: 'orders', action: 'view' })
    expect(Reflect.getMetadata(GUARDS_METADATA, proto[method])).toEqual([PermissionGuard])
  })

  it('serves fourm at GET board/fourm', () => {
    expect(Reflect.getMetadata(PATH_METADATA, proto.fourm)).toBe('board/fourm')
    expect(Reflect.getMetadata(METHOD_METADATA, proto.fourm)).toBe(RequestMethod.GET)
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

  it('passes version_id through to fourm', async () => {
    const svc = { fourm: jest.fn().mockResolvedValue({}) }
    const ctrl = new ScheduleController(svc as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    await ctrl.fourm({ version_id: 7 })
    await ctrl.fourm({})
    expect(svc.fourm.mock.calls).toEqual([[7], [undefined]])
  })
})

describe('GET /schedule/board vs /schedule/board/fourm routing (HTTP)', () => {
  let app: INestApplication
  const svc = {
    board: jest.fn().mockResolvedValue({ kind: 'board' }),
    fourm: jest.fn().mockResolvedValue({ kind: 'fourm' }),
  }
  const allow = { canActivate: () => true }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [{ provide: ScheduleService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(PermissionGuard)
      .useValue(allow)
      .compile()
    app = mod.createNestApplication()
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
    await app.init()
  })
  afterAll(() => app.close())
  beforeEach(() => jest.clearAllMocks())

  it('routes /board/fourm to fourm, not board', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/schedule/board/fourm?version_id=7').expect(200)
    expect(res.body).toEqual({ kind: 'fourm' })
    expect(svc.fourm.mock.calls).toEqual([[7]])
    expect(svc.board).not.toHaveBeenCalled()
  })

  it('still routes /board to board', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/schedule/board').expect(200)
    expect(res.body).toEqual({ kind: 'board' })
    expect(svc.board.mock.calls).toEqual([[undefined]])
    expect(svc.fourm).not.toHaveBeenCalled()
  })

  it('400s a non-integer version_id on /board/fourm', async () => {
    await request(app.getHttpServer()).get('/api/v1/schedule/board/fourm?version_id=abc').expect(400)
    expect(svc.fourm).not.toHaveBeenCalled()
  })
})
