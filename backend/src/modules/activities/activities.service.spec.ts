import { Prisma } from '@prisma/client'
import { ActivitiesService } from './activities.service'

// computeActivityDuration() reads activity.per_minute (units/min) to scale a
// formula-based duration, but the Activity form only captures the
// "every <ratio> <unit> takes <per_time> min" trio and has no per_minute
// input — so every UI-created activity was saved with per_minute NULL and
// its formula silently fell back to fixed duration_min (caught live creating
// ACT-00066 through the UI, 2026-09-16). The service now derives per_minute
// from ratio/per_time, which is the source of truth whenever both are set.
function makeService(existing: Record<string, unknown> = {}) {
  const prisma: any = {
    activity: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 1, ratio: null, per_time: null, per_minute: null, ...existing }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1 }),
    },
    activity_tool: { createMany: jest.fn(), deleteMany: jest.fn() },
    materials: { findMany: jest.fn().mockResolvedValue([]) },
    equipment_resource: { findMany: jest.fn().mockResolvedValue([]) },
  }
  prisma.$transaction = jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma))
  const codeGen = { generate: jest.fn().mockResolvedValue('ACT-00099') }
  const svc = new ActivitiesService(prisma, codeGen as any)
  return { svc, prisma }
}

const createData = (prisma: any) => prisma.activity.create.mock.calls[0][0].data
const updateData = (prisma: any) => prisma.activity.update.mock.calls[0][0].data

describe('ActivitiesService.create — per_minute derivation', () => {
  it('derives per_minute = ratio / per_time when the caller sends no per_minute (the Activity form never does)', async () => {
    const { svc, prisma } = makeService()

    await svc.create({ name: 'Lift the workpiece onto the jig', duration_min: 10, formula_code: 'buildup_weight', ratio: 500, ratio_unit: 'kilogram', per_time: 10 }, 1)

    expect(createData(prisma).per_minute).toBe(50)
  })

  it('lets ratio/per_time win over a supplied per_minute — they are the source of truth when both are set', async () => {
    const { svc, prisma } = makeService()

    await svc.create({ name: 'x', duration_min: 1, ratio: 500, per_time: 10, per_minute: 999 }, 1)

    expect(createData(prisma).per_minute).toBe(50)
  })

  it('keeps a supplied per_minute when ratio/per_time are not both set (legacy rate-only callers)', async () => {
    const { svc, prisma } = makeService()

    await svc.create({ name: 'x', duration_min: 1, per_minute: 700 }, 1)

    expect(createData(prisma).per_minute).toBe(700)
  })

  it('stores per_minute as null instead of dividing by zero when per_time is 0', async () => {
    const { svc, prisma } = makeService()

    await svc.create({ name: 'x', duration_min: 1, ratio: 500, per_time: 0 }, 1)

    expect(createData(prisma).per_minute).toBeNull()
  })
})

describe('ActivitiesService.create — kind', () => {
  it('persists the given kind (setup time is summed separately from run time by computeActivityDuration)', async () => {
    const { svc, prisma } = makeService()

    await svc.create({ name: 'Flip the workpiece', duration_min: 3, kind: 'move' }, 1)

    expect(createData(prisma).kind).toBe('move')
  })

  it('leaves kind to the column default when none is given', async () => {
    const { svc, prisma } = makeService()

    await svc.create({ name: 'x', duration_min: 1 }, 1)

    expect(createData(prisma)).not.toHaveProperty('kind')
  })
})

describe('ActivitiesService.update — per_minute derivation', () => {
  it('recomputes per_minute from the merged ratio/per_time when either is touched, ignoring the stale per_minute the form re-sends', async () => {
    // Existing row: every 500 kg takes 10 min (per_minute 50). The edit
    // form re-sends the loaded per_minute unchanged alongside the new ratio.
    const { svc, prisma } = makeService({ ratio: new Prisma.Decimal(500), per_time: new Prisma.Decimal(10), per_minute: new Prisma.Decimal(50) })

    await svc.update(1, { ratio: 600, per_minute: 50 }, 1)

    expect(updateData(prisma).per_minute).toBe(60)
  })

  it('uses the supplied per_minute as-is when neither ratio nor per_time is touched', async () => {
    const { svc, prisma } = makeService({ ratio: new Prisma.Decimal(500), per_time: new Prisma.Decimal(10) })

    await svc.update(1, { per_minute: 75 }, 1)

    expect(updateData(prisma).per_minute).toBe(75)
  })

  it('leaves per_minute untouched when the update touches none of the rate fields', async () => {
    const { svc, prisma } = makeService({ ratio: new Prisma.Decimal(500), per_time: new Prisma.Decimal(10) })

    await svc.update(1, { name: 'Renamed' }, 1)

    expect(updateData(prisma)).not.toHaveProperty('per_minute')
  })

  it('updates kind', async () => {
    const { svc, prisma } = makeService()

    await svc.update(1, { kind: 'inspect' }, 1)

    expect(updateData(prisma).kind).toBe('inspect')
  })
})
