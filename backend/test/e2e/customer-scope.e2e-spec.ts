/**
 * Customer users: default-deny allowlist, company scoping, weight/date stripping.
 * Requires a live Postgres DB (run via docker compose). Creates and removes its own rows.
 */
import { Test } from '@nestjs/testing'
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common'
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/prisma/prisma.service'
import { CUSTOMER_ACCESS_KEY } from '../../src/common/customer-scope/customer-accessible.decorator'

const TAG = `CS${Date.now() % 1_000_000}`

describe('Customer scope E2E', () => {
  let app: INestApplication
  let prisma: PrismaService
  let customerToken: string
  let employeeToken: string
  const ids = {} as Record<'partnerA' | 'partnerB' | 'projectA' | 'projectB' | 'zoneA' | 'zoneB' | 'customer' | 'employee', number>
  const codeA = `${TAG}A`
  const codeB = `${TAG}B`

  const api = () => request(app.getHttpServer())
  const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${customerToken}`)
  const asEmployee = (req: request.Test) => req.set('Authorization', `Bearer ${employeeToken}`)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
    prisma = app.get(PrismaService)
    const jwt = app.get(JwtService)

    const employee = await prisma.res_users.create({
      data: { login: `${TAG}-emp`, name: 'Scope Employee', role: 'BTE', user_type: 'employee' },
    })
    ids.employee = employee.id
    ids.partnerA = (await prisma.res_partner.create({ data: { name: `${TAG} Customer A` } })).id
    ids.partnerB = (await prisma.res_partner.create({ data: { name: `${TAG} Customer B` } })).id
    const audit = { create_uid: employee.id, write_uid: employee.id }
    ids.projectA = (await prisma.project.create({
      data: { project_code: codeA, name: 'A', customer_id: ids.partnerA, start_date: new Date('2026-01-01'), ...audit },
    })).id
    ids.projectB = (await prisma.project.create({ data: { project_code: codeB, name: 'B', customer_id: ids.partnerB, ...audit } })).id
    ids.zoneA = (await prisma.project_zone.create({ data: { project_id: ids.projectA, code: 'Z1', label: 'Zone 1', target_start: new Date() } })).id
    ids.zoneB = (await prisma.project_zone.create({ data: { project_id: ids.projectB, code: 'Z1', label: 'Zone 1' } })).id
    const customer = await prisma.res_users.create({
      data: {
        login: `${TAG}-cust`, name: 'Scope Customer', role: 'customer', user_type: 'customer', partner_id: ids.partnerA,
        module_permissions: {
          create: ['projects', 'project-zones', 'sub-zones', 'project-tracking', 'bim'].map((module) => ({ module, can_view: true })),
        },
      },
    })
    ids.customer = customer.id

    customerToken = jwt.sign({ sub: customer.id, login: customer.login, role: customer.role })
    employeeToken = jwt.sign({ sub: employee.id, login: employee.login, role: employee.role })
  })

  afterAll(async () => {
    await prisma.res_users.deleteMany({ where: { id: ids.customer } })
    await prisma.project_zone.deleteMany({ where: { project_id: { in: [ids.projectA, ids.projectB] } } })
    await prisma.mail_message.deleteMany({ where: { author_id: ids.employee } })
    await prisma.project.deleteMany({ where: { id: { in: [ids.projectA, ids.projectB] } } })
    await prisma.res_partner.deleteMany({ where: { id: { in: [ids.partnerA, ids.partnerB] } } })
    await prisma.res_users.deleteMany({ where: { id: ids.employee } })
    await app.close()
  })

  it('project list only contains the customer company, even when asking for another customer_id', async () => {
    const res = await asCustomer(api().get(`/api/v1/projects?q=${TAG}&customer_id=${ids.partnerB}`))
    expect(res.status).toBe(200)
    expect(res.body.items.map((p: { project_code: string }) => p.project_code)).toEqual([codeA])
  })

  it('strips dates from project detail', async () => {
    const res = await asCustomer(api().get(`/api/v1/projects/${codeA}`))
    expect(res.status).toBe(200)
    expect(res.body.project_code).toBe(codeA)
    expect(res.body).not.toHaveProperty('start_date')
    expect(res.body).not.toHaveProperty('create_date')
  })

  it('404s on another company project, zone, and mixed own-project + foreign-zone', async () => {
    expect((await asCustomer(api().get(`/api/v1/projects/${codeB}`))).status).toBe(404)
    expect((await asCustomer(api().get(`/api/v1/projects/${ids.projectB}/zones`))).status).toBe(404)
    expect((await asCustomer(api().get(`/api/v1/zones/${ids.zoneB}/sub-zones`))).status).toBe(404)
    expect((await asCustomer(api().get(`/api/v1/projects/${codeA}/progress/zones/${ids.zoneB}`))).status).toBe(404)
    expect((await asCustomer(api().get(`/api/v1/drawings?zone_id=${ids.zoneB}`))).status).toBe(404)
  })

  it('allows own zones with target dates stripped', async () => {
    const res = await asCustomer(api().get(`/api/v1/projects/${ids.projectA}/zones`))
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toMatch(/target_start|target_end/)
  })

  it('progress overview has no weight or date keys', async () => {
    const res = await asCustomer(api().get(`/api/v1/projects/${codeA}/progress/overview`))
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toMatch(/weight|_date"|breakdown|schedule_progress/)
  })

  it('refuses unscoped list endpoints and non-allowlisted reads', async () => {
    expect((await asCustomer(api().get('/api/v1/drawings'))).status).toBe(403)
    expect((await asCustomer(api().get('/api/v1/bim-models'))).status).toBe(403)
    expect((await asCustomer(api().get('/api/v1/customers'))).status).toBe(403)
    expect((await asCustomer(api().get(`/api/v1/projects/${codeA}/progress/history`))).status).toBe(403)
    expect((await asCustomer(api().get(`/api/v1/projects/${codeA}/progress/export`))).status).toBe(403)
  })

  it('refuses writes even on allowlisted controllers', async () => {
    const res = await asCustomer(api().patch(`/api/v1/projects/${codeA}`).send({ name: 'hacked' }))
    expect(res.status).toBe(403)
  })

  it('still serves auth self-service endpoints', async () => {
    const res = await asCustomer(api().get('/api/v1/auth/me'))
    expect(res.status).toBe(200)
    expect(res.body.user_type).toBe('customer')
  })

  it('leaves employees unscoped and unstripped', async () => {
    const list = await asEmployee(api().get(`/api/v1/projects?q=${TAG}`))
    expect(list.body.items.map((p: { project_code: string }) => p.project_code).sort()).toEqual([codeA, codeB])
    const detail = await asEmployee(api().get(`/api/v1/projects/${codeA}`))
    expect(detail.body).toHaveProperty('start_date')
  })

  // Route inventory: every route without @CustomerAccessible must refuse a customer,
  // so a newly added endpoint can't leak data by forgetting the decorator.
  it('denies the customer on every non-allowlisted route', async () => {
    const discovery = app.get(DiscoveryService)
    const scanner = app.get(MetadataScanner)
    const reflector = app.get(Reflector)
    const verbs: Partial<Record<RequestMethod, 'get' | 'post' | 'put' | 'patch' | 'delete'>> = {
      [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put',
      [RequestMethod.PATCH]: 'patch', [RequestMethod.DELETE]: 'delete',
    }
    const leaks: string[] = []
    let checked = 0

    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper
      if (!instance || !metatype) continue
      const base = [Reflect.getMetadata(PATH_METADATA, metatype)].flat()[0] ?? ''
      const classAccess = reflector.get(CUSTOMER_ACCESS_KEY, metatype)
      for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const handler = instance[name]
        const path = Reflect.getMetadata(PATH_METADATA, handler)
        const verb = verbs[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod]
        if (path === undefined || !verb) continue
        if (classAccess || reflector.get(CUSTOMER_ACCESS_KEY, handler)) continue
        const url = `/api/v1/${[base, [path].flat()[0]].filter(Boolean).join('/')}`
          .replace(/:[A-Za-z_]+/g, '1')
          .replace(/\/+/g, '/')
        const res = await asCustomer(api()[verb](url))
        checked++
        if (res.status !== 403 && res.status !== 401) leaks.push(`${verb.toUpperCase()} ${url} → ${res.status}`)
      }
    }
    expect(checked).toBeGreaterThan(50)
    expect(leaks).toEqual([])
  })
})
