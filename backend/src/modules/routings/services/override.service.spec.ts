import { NotFoundException } from '@nestjs/common'
import { OverrideService } from './override.service'

beforeAll(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}) })
afterAll(() => { jest.restoreAllMocks() })

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    product_routing_override: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    routing_activity_template: {
      findUnique: jest.fn(),
    },
    ...overrides,
  } as unknown as any
}

function makeMail() {
  return { log: jest.fn().mockResolvedValue({}) } as unknown as any
}

const MOCK_TPL = { id: 5, op_code: 'welding', description: 'Weld it' }
const MOCK_OVERRIDE = { id: 1, product_id: 13, activity_template_id: 5, override_per_minute: '15', reason: 'test' }
const UID = 1

describe('OverrideService', () => {
  let svc: OverrideService

  it('listOverrides returns product overrides', async () => {
    const prisma = makePrisma()
    ;(prisma.product_routing_override.findMany as jest.Mock).mockResolvedValue([MOCK_OVERRIDE])
    svc = new OverrideService(prisma, makeMail())

    const result = await svc.listOverrides(13)
    expect(result).toEqual([MOCK_OVERRIDE])
    expect(prisma.product_routing_override.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { product_id: 13 } }),
    )
  })

  it('upsertOverride creates new override', async () => {
    const prisma = makePrisma()
    ;(prisma.routing_activity_template.findUnique as jest.Mock).mockResolvedValue(MOCK_TPL)
    ;(prisma.product_routing_override.upsert as jest.Mock).mockResolvedValue(MOCK_OVERRIDE)
    svc = new OverrideService(prisma, makeMail())

    const result = await svc.upsertOverride(13, 5, { override_per_minute: 15, reason: 'test' }, UID)
    expect(result).toEqual(MOCK_OVERRIDE)
    expect(prisma.product_routing_override.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { product_id_activity_template_id: { product_id: 13, activity_template_id: 5 } },
        create: expect.objectContaining({ override_per_minute: 15 }),
      }),
    )
  })

  it('upsertOverride updates existing override', async () => {
    const prisma = makePrisma()
    ;(prisma.routing_activity_template.findUnique as jest.Mock).mockResolvedValue(MOCK_TPL)
    ;(prisma.product_routing_override.upsert as jest.Mock).mockResolvedValue({ ...MOCK_OVERRIDE, override_per_minute: '20' })
    svc = new OverrideService(prisma, makeMail())

    const result = await svc.upsertOverride(13, 5, { override_per_minute: 20 }, UID)
    expect(prisma.product_routing_override.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ override_per_minute: 20 }),
      }),
    )
    expect(result.override_per_minute).toBe('20')
  })

  it('upsertOverride throws NotFoundException when activity template not found', async () => {
    const prisma = makePrisma()
    ;(prisma.routing_activity_template.findUnique as jest.Mock).mockResolvedValue(null)
    svc = new OverrideService(prisma, makeMail())

    await expect(svc.upsertOverride(13, 999, {}, UID)).rejects.toThrow(NotFoundException)
  })

  it('upsertOverride logs mail message', async () => {
    const prisma = makePrisma()
    ;(prisma.routing_activity_template.findUnique as jest.Mock).mockResolvedValue(MOCK_TPL)
    ;(prisma.product_routing_override.upsert as jest.Mock).mockResolvedValue(MOCK_OVERRIDE)
    const mail = makeMail()
    svc = new OverrideService(prisma, mail)

    await svc.upsertOverride(13, 5, {}, UID)
    expect(mail.log).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'product', res_id: 13, message_type: 'audit' }),
    )
  })

  it('removeOverride deletes override', async () => {
    const prisma = makePrisma()
    ;(prisma.product_routing_override.findUnique as jest.Mock).mockResolvedValue(MOCK_OVERRIDE)
    svc = new OverrideService(prisma, makeMail())

    await svc.removeOverride(13, 5, UID)
    expect(prisma.product_routing_override.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { product_id_activity_template_id: { product_id: 13, activity_template_id: 5 } },
      }),
    )
  })

  it('removeOverride throws NotFoundException when override not found', async () => {
    const prisma = makePrisma()
    ;(prisma.product_routing_override.findUnique as jest.Mock).mockResolvedValue(null)
    svc = new OverrideService(prisma, makeMail())

    await expect(svc.removeOverride(13, 5, UID)).rejects.toThrow(NotFoundException)
  })

  it('removeOverride logs mail message', async () => {
    const prisma = makePrisma()
    ;(prisma.product_routing_override.findUnique as jest.Mock).mockResolvedValue(MOCK_OVERRIDE)
    const mail = makeMail()
    svc = new OverrideService(prisma, mail)

    await svc.removeOverride(13, 5, UID)
    expect(mail.log).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'product', res_id: 13, message_type: 'audit' }),
    )
  })

  it('ECO gate stub does not throw (hasConfirmedMO always false in Sprint 4.2)', async () => {
    const prisma = makePrisma()
    ;(prisma.routing_activity_template.findUnique as jest.Mock).mockResolvedValue(MOCK_TPL)
    ;(prisma.product_routing_override.upsert as jest.Mock).mockResolvedValue(MOCK_OVERRIDE)
    svc = new OverrideService(prisma, makeMail())

    await expect(
      svc.upsertOverride(13, 5, { eco_id: undefined }, UID),
    ).resolves.not.toThrow()
  })
})
