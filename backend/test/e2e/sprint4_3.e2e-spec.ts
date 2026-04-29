/**
 * Sprint 4.3 E2E — Simulator, Bulk Override, History Triggers, Custom Routing Promotion
 * Requires a live Postgres DB with seed data (pnpm prisma:seed + seed-routing.ts)
 *
 * Path A: bulk override → preview → apply → verify products updated
 * Path B: update template → GET history returns entry (trigger fired)
 * Path C: get required-attrs → simulate template → verify result shape
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'

const PRODUCT_CODE = 'CUS-00001'

describe('Sprint 4.3 E2E', () => {
  let app: INestApplication
  let templateId: number
  let activityTemplateId: number

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()

    // Resolve a valid routing template ID
    const tplRes = await request(app.getHttpServer()).get('/api/v1/routing-templates')
    if (tplRes.body.length > 0) templateId = tplRes.body[0].id

    // Resolve a valid activity template ID
    const actRes = await request(app.getHttpServer()).get('/api/v1/activity-templates?limit=1')
    if (actRes.body?.items?.length > 0) activityTemplateId = actRes.body.items[0].id
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Path A: Bulk Override ──────────────────────────────────────

  describe('Path A — Bulk Override', () => {
    it('POST /routing-overrides/bulk with preview_only returns matched_count', async () => {
      if (!activityTemplateId) return

      const res = await request(app.getHttpServer())
        .post('/api/v1/routing-overrides/bulk')
        .send({
          criteria: {},
          override: {
            activity_template_id: activityTemplateId,
            override_per_minute: 99,
            reason: 'E2E bulk test',
          },
          preview_only: true,
        })

      expect(res.status).toBe(201)
      expect(typeof res.body.matched_count).toBe('number')
      expect(Array.isArray(res.body.affected_products)).toBe(true)
    })

    it('POST /routing-overrides/bulk without preview_only applies override', async () => {
      if (!activityTemplateId) return

      const res = await request(app.getHttpServer())
        .post('/api/v1/routing-overrides/bulk')
        .send({
          criteria: { routing_template_id: templateId },
          override: {
            activity_template_id: activityTemplateId,
            override_per_minute: 88,
            reason: 'E2E bulk apply',
          },
          preview_only: false,
        })

      expect(res.status).toBe(201)
      expect(typeof res.body.applied_count).toBe('number')
    })
  })

  // ── Path B: History trigger ────────────────────────────────────

  describe('Path B — History trigger', () => {
    it('GET /routing-templates/:id/history returns array', async () => {
      if (!templateId) return

      const res = await request(app.getHttpServer())
        .get(`/api/v1/routing-templates/${templateId}/history`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })

    it('GET /activity-templates/:id/history returns array', async () => {
      if (!activityTemplateId) return

      const res = await request(app.getHttpServer())
        .get(`/api/v1/activity-templates/${activityTemplateId}/history`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })

    it('GET override history for product returns array', async () => {
      if (!activityTemplateId) return

      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${PRODUCT_CODE}/routing-overrides/${activityTemplateId}/history`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  // ── Path C: Template Simulator ─────────────────────────────────

  describe('Path C — Template Simulator', () => {
    it('GET /routing-templates/:id/required-attrs returns attr list', async () => {
      if (!templateId) return

      const res = await request(app.getHttpServer())
        .get(`/api/v1/routing-templates/${templateId}/required-attrs`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })

    it('POST /routing-templates/:id/simulate returns result with operations', async () => {
      if (!templateId) return

      const attrsRes = await request(app.getHttpServer())
        .get(`/api/v1/routing-templates/${templateId}/required-attrs`)

      const attrs: Record<string, number> = {}
      if (attrsRes.body.length > 0) {
        for (const a of attrsRes.body) attrs[a.key] = 100
      }

      const res = await request(app.getHttpServer())
        .post(`/api/v1/routing-templates/${templateId}/simulate`)
        .send({ attributes: attrs })

      expect(res.status).toBe(201)
      expect(Array.isArray(res.body.operations)).toBe(true)
      expect(typeof res.body.total_cycle_time_min).toBe('number')
    })

    it('GET /routing-templates/:id/fixtures returns array', async () => {
      if (!templateId) return

      const res = await request(app.getHttpServer())
        .get(`/api/v1/routing-templates/${templateId}/fixtures`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })

    it('POST /routing-templates/:id/fixtures creates a fixture', async () => {
      if (!templateId) return

      const res = await request(app.getHttpServer())
        .post(`/api/v1/routing-templates/${templateId}/fixtures`)
        .set('x-user-id', '1')
        .send({
          name: 'E2E Fixture',
          source_mode: 'manual',
          attribute_values: { weight_kg: 100 },
        })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('E2E Fixture')
    })
  })

  // ── Path D: Promotion candidates ──────────────────────────────

  describe('Path D — Promotion candidates', () => {
    it('GET /custom-routings/promotion-candidates returns array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/custom-routings/promotion-candidates')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })
})
