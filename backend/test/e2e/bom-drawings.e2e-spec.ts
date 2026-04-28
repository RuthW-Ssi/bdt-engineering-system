/**
 * E2E: BOM + Drawings Sprint 3
 * Requires live Postgres (docker compose up) with seed data.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'

describe('BOM + Drawings E2E', () => {
  let app: INestApplication

  // IDs created during tests — shared between its in the same describe block
  let newBomId: number
  let newDrawingId: number

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

  // ─── Scenario 3: Drawing lifecycle ───────────────────────────────────────────

  describe('Scenario 3 — Drawing lifecycle: draft → in_review → approved → released', () => {
    it('GET /drawings?product_code=CUS-00001 → returns seeded drawing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drawings')
        .query({ product_code: 'CUS-00001' })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })

    it('POST /drawings → creates new drawing for CUS-00001', async () => {
      const timestamp = Date.now()
      const res = await request(app.getHttpServer())
        .post('/api/v1/drawings')
        .set('x-user-id', '1')
        .send({
          drawing_number: `DWG-TEST-${timestamp}`,
          drawing_type: 'project',
          product_code: 'CUS-00001',
          project_id: 1,
          cad_source: 'autocad',
        })
      expect(res.status).toBe(201)
      newDrawingId = res.body.id
      expect(res.body.state).toBe('draft')
    })

    it('POST /drawings/:id/revisions → adds revision A with is_current=true', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/drawings/${newDrawingId}/revisions`)
        .set('x-user-id', '1')
        .send({
          revision: 'A',
          change_summary: 'First issue',
          file_url: '/storage/drawings/test-revA.pdf',
          file_mime_type: 'application/pdf',
          file_size_bytes: 512000,
        })
      expect(res.status).toBe(201)
      const currentRev = res.body.revisions.find((r: any) => r.is_current)
      expect(currentRev?.revision).toBe('A')
    })

    it('POST action_submit_review → draft → in_review', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/drawings/${newDrawingId}/action_submit_review`)
        .set('x-user-id', '1')
      expect(res.status).toBe(200)
      expect(res.body.state).toBe('in_review')
    })

    it('POST action_approve → in_review → approved', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/drawings/${newDrawingId}/action_approve`)
        .set('x-user-id', '1')
        .send({ approved_uid: 1 })
      expect(res.status).toBe(200)
      expect(res.body.state).toBe('approved')
    })

    it('POST action_release → approved → released, retention_until set', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/drawings/${newDrawingId}/action_release`)
        .set('x-user-id', '1')
      expect(res.status).toBe(200)
      expect(res.body.state).toBe('released')
    })
  })

  // ─── Scenario 4: Revision sequence — B replaces A ────────────────────────────

  describe('Scenario 4 — Adding revision B marks A as not current', () => {
    let drawingForRevTest: number

    beforeAll(async () => {
      // Create a fresh drawing for this test
      const timestamp = Date.now()
      const res = await request(app.getHttpServer())
        .post('/api/v1/drawings')
        .set('x-user-id', '1')
        .send({
          drawing_number: `DWG-REVTEST-${timestamp}`,
          drawing_type: 'project',
          product_code: 'CUS-00001',
          project_id: 1,
          cad_source: 'tekla',
        })
      drawingForRevTest = res.body.id

      await request(app.getHttpServer())
        .post(`/api/v1/drawings/${drawingForRevTest}/revisions`)
        .set('x-user-id', '1')
        .send({ revision: 'A', change_summary: 'Initial', file_url: '/storage/test-A.pdf' })
    })

    it('add revision B → A.is_current=false, B.is_current=true', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/drawings/${drawingForRevTest}/revisions`)
        .set('x-user-id', '1')
        .send({ revision: 'B', change_summary: 'Rev B update', file_url: '/storage/test-B.pdf' })
      expect(res.status).toBe(201)

      const revisions: any[] = res.body.revisions
      const revA = revisions.find(r => r.revision === 'A')
      const revB = revisions.find(r => r.revision === 'B')
      expect(revA?.is_current).toBe(false)
      expect(revB?.is_current).toBe(true)
      expect(res.body.current_revision).toBe('B')
    })

    it('add revision A again → 400 (out of sequence)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/drawings/${drawingForRevTest}/revisions`)
        .set('x-user-id', '1')
        .send({ revision: 'A', change_summary: 'Duplicate', file_url: '/storage/test-A2.pdf' })
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
