/**
 * Sprint 4.2 E2E — Routing Option 3 (Hybrid Template + Override + Custom)
 * Requires a live Postgres DB with seed data (pnpm prisma:seed + seed-routing.ts)
 *
 * Path A: template binding → add override → recompute → cycle time uses override
 * Path B: convert to custom routing → delete 1 op → recompute → total lower
 * Path C: restore to template → has_custom_routing=false → badge gone
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'

const PRODUCT_CODE = 'CUS-00001'

describe('Sprint 4.2 — Routing Option 3 E2E', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Precondition ────────────────────────────────────────────────

  it('CUS-00001 has routing_template_id and has_custom_routing=false', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}`)
    expect(res.status).toBe(200)
    expect(res.body.routing_template_id).not.toBeNull()
    expect(res.body.has_custom_routing).toBe(false)
  })

  it('GET /routing returns 5 template ops', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}/routing`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(5)
  })

  // ── Path A: Override flow ───────────────────────────────────────

  describe('Path A — template override', () => {
    let baselineTotal: number
    let activityTemplateId: number

    it('recompute returns positive total', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${PRODUCT_CODE}/routing/recompute?force=true`)
      expect(res.status).toBe(201)
      expect(res.body.total_cycle_time_min).toBeGreaterThan(0)
      baselineTotal = res.body.total_cycle_time_min
      activityTemplateId = res.body.operations[0].activities[0].activity_template_id
    })

    it('POST override changes per_minute for activity', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${PRODUCT_CODE}/routing-overrides/${activityTemplateId}`)
        .send({ override_per_minute: 999, reason: 'e2e test' })
      expect(res.status).toBe(201)
      expect(Number(res.body.override_per_minute)).toBe(999)
    })

    it('GET overrides shows 1 row', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}/routing-overrides`)
      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
    })

    it('recompute after override reflects override value', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${PRODUCT_CODE}/routing/recompute?force=true`)
      expect(res.status).toBe(201)
      const act = res.body.operations[0].activities[0]
      expect(act.per_minute).toBe(999)
    })

    it('DELETE override removes it', async () => {
      const del = await request(app.getHttpServer())
        .delete(`/api/v1/products/${PRODUCT_CODE}/routing-overrides/${activityTemplateId}`)
      expect(del.status).toBe(200)

      const list = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}/routing-overrides`)
      expect(list.body.length).toBe(0)
    })
  })

  // ── Path B: Custom routing ──────────────────────────────────────

  describe('Path B — custom routing', () => {
    let templateId: number
    let opIdToDelete: number
    let baselineOpCount: number

    it('GET routing returns ops with template', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}/routing`)
      expect(res.status).toBe(200)
      baselineOpCount = res.body.length
      expect(baselineOpCount).toBeGreaterThan(0)
    })

    it('GET product has routing_template_id set', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}`)
      templateId = res.body.routing_template_id
      expect(templateId).not.toBeNull()
    })

    it('POST convert to custom routing clones ops', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${PRODUCT_CODE}/custom-routing`)
        .send({ from_template_id: templateId })
      expect(res.status).toBe(201)
      expect(res.body.ops).toBeDefined()
      expect(res.body.ops.length).toBe(baselineOpCount)
      opIdToDelete = res.body.ops[0].id
    })

    it('GET product has has_custom_routing=true', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}`)
      expect(res.body.has_custom_routing).toBe(true)
      expect(res.body.routing_template_id).toBeNull()
    })

    it('DELETE op reduces op count by 1', async () => {
      const del = await request(app.getHttpServer())
        .delete(`/api/v1/products/${PRODUCT_CODE}/custom-routing/ops/${opIdToDelete}`)
      expect(del.status).toBe(200)

      const get = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}/custom-routing`)
      expect(get.body.ops.length).toBe(baselineOpCount - 1)
    })

    it('recompute custom routing returns result', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${PRODUCT_CODE}/routing/recompute?force=true`)
      expect(res.status).toBe(201)
      expect(res.body.operations.length).toBe(baselineOpCount - 1)
    })
  })

  // ── Path C: Restore to template ─────────────────────────────────

  describe('Path C — restore to template', () => {
    let templateId: number

    it('GET binding rules returns at least 1 rule', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/routing-template-binding-rules')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
      templateId = res.body[0].routing_template_id
    })

    it('restore to template sets has_custom_routing=false', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${PRODUCT_CODE}/custom-routing/restore-to-template`)
        .send({ template_id: templateId })
      expect(res.status).toBe(201)
    })

    it('GET product has has_custom_routing=false after restore', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}`)
      expect(res.body.has_custom_routing).toBe(false)
      expect(res.body.routing_template_id).not.toBeNull()
    })

    it('GET routing returns template ops again', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${PRODUCT_CODE}/routing`)
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
    })
  })
})
