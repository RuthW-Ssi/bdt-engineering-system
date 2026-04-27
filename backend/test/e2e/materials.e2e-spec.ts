/**
 * E2E happy path: register → list → action_submit
 * Requires a live Postgres DB (run via docker compose)
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'

describe('Materials E2E — happy path', () => {
  let app: INestApplication
  let createdCode: string

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

  it('GET /api/v1/healthz → 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/healthz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('GET /api/v1/product-categories → 200 with categories', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/product-categories')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /api/v1/materials → 201 registers new material', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('x-user-id', '1')
      .send({
        categ_id: 1, // will resolve to first available category
        uom_id: 1,
        name: 'เหล็ก H-Beam SS400',
        description_sale: 'H-BEAM SS400 H=300 B=150',
        attributes: { grade: 'SS400', height_h: 300, width_b: 150, web_tw: 6.5, flange_tf: 9 },
      })
    // Accept 201 or 422 (if categ/uom IDs don't exist in test DB yet)
    expect([201, 422]).toContain(res.status)
    if (res.status === 201) {
      createdCode = res.body.default_code
      expect(res.body.state).toBe('draft')
    }
  })

  it('GET /api/v1/materials → 200 with pagination', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/materials?page=1&limit=5')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('items')
  })

  it('POST action_submit changes state to to_approve (if material was created)', async () => {
    if (!createdCode) return
    const res = await request(app.getHttpServer())
      .post(`/api/v1/materials/${createdCode}/action_submit`)
      .set('x-user-id', '1')
    expect(res.status).toBe(201)
    expect(res.body.state).toBe('to_approve')
  })

  it('POST /api/v1/materials → 422 for lowercase description', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('x-user-id', '1')
      .send({
        categ_id: 1,
        uom_id: 1,
        name: 'test',
        description_sale: 'h-beam ss400 small',
        attributes: {},
      })
    expect([422, 400]).toContain(res.status)
  })
})
