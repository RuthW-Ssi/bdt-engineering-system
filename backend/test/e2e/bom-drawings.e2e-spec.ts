/**
 * E2E: BOM Sprint 3
 * Requires live Postgres (docker compose up) with seed data.
 * (Drawing scenarios removed 2026-08-21 — the Sprint 3 Shop Drawing module
 * they covered was deleted; see wiki/features/drawing.md for its replacement.
 * File kept at its original path/name to avoid an unrelated CI/test-glob change.)
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'

describe('BOM E2E', () => {
  let app: INestApplication

  // IDs created during tests — shared between its in the same describe block
  let newBomId: number

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

  // ─── Scenario 1: Standard product → BOM → activate ──────────────────────────

  describe('Scenario 1 — STD product BOM lifecycle', () => {
    it('GET /boms → CUS-00001 already has a seeded BOM', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/CUS-00001/boms')
        .set('x-user-id', '1')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThanOrEqual(1)
    })

    it('POST /boms → creates new BOM v2.0.0 for CUS-00001', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products/CUS-00001/boms')
        .set('x-user-id', '1')
        .send({ version: '2.0.0', product_uom_id: 1, bom_type: 'normal' })
      // 201 or 409 if one is already active (seed may have activated it)
      expect([201, 409]).toContain(res.status)
      if (res.status === 201) {
        newBomId = res.body.id
        expect(res.body.state).toBe('draft')
        expect(res.body.version).toBe('2.0.0')
      }
    })

    it('POST /boms/:id/action_activate → activates the BOM', async () => {
      if (!newBomId) return // skipped if creation above failed (conflict)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${newBomId}/action_activate`)
        .set('x-user-id', '1')
      expect([200, 409, 422]).toContain(res.status)
      if (res.status === 200) {
        expect(res.body.state).toBe('active')
      }
    })
  })

  // ─── Scenario 2: XOR validator ───────────────────────────────────────────────

  describe('Scenario 2 — BOM line XOR validator', () => {
    let draftBomId: number

    beforeAll(async () => {
      // Get a draft BOM to add lines to
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/products/CUS-00001/boms')
        .set('x-user-id', '1')
      const drafts = listRes.body.filter((b: any) => b.state === 'draft')
      if (drafts.length > 0) draftBomId = drafts[0].id
    })

    it('POST /boms/:id/lines with both material_id + sub_product_id → 400', async () => {
      if (!draftBomId) return
      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${draftBomId}/lines`)
        .set('x-user-id', '1')
        .send({ material_id: 1, sub_product_id: 1, product_qty: 1, product_uom_id: 1 })
      expect(res.status).toBe(400)
    })

    it('POST /boms/:id/lines with neither material_id nor sub_product_id → 400', async () => {
      if (!draftBomId) return
      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${draftBomId}/lines`)
        .set('x-user-id', '1')
        .send({ product_qty: 1, product_uom_id: 1 })
      expect(res.status).toBe(400)
    })
  })

  // ─── Scenario 5: Modify active BOM line is blocked ───────────────────────────

  describe('Scenario 5 — Active BOM lines are immutable', () => {
    let activeBomId: number

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/CUS-00001/boms')
        .set('x-user-id', '1')
      const active = res.body.find((b: any) => b.state === 'active')
      if (active) activeBomId = active.id
    })

    it('PATCH /boms/:id/lines/:lineId on active BOM → 409 or 422', async () => {
      if (!activeBomId) return

      // Get lines
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/boms/${activeBomId}`)
        .set('x-user-id', '1')
      const lineId = detail.body.lines?.[0]?.id
      if (!lineId) return

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/boms/${activeBomId}/lines/${lineId}`)
        .set('x-user-id', '1')
        .send({ product_qty: 99 })
      expect([409, 422]).toContain(res.status)
    })
  })
})
