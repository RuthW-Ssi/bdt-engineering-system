import { ConflictException, NotFoundException } from '@nestjs/common'
import { bangkokNowIso, SCHEDULER_LOCK_KEY, ScheduleService } from './schedule.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
const USER = { sub: 7, login: 'planner1', role: 'user' }

const RESULT = {
  direction: 'backward',
  dispatch_rule: 'EDD',
  kpi: { work_orders: 125, late_vs_due: 3 },
  line_load_min: {},
  version_id: 2,
  version_code: 'BACKWARD-V1',
  is_active: false,
  requested_by: 'planner1',
}

function makeDeps(versionRow: unknown = { id: 2, version_code: 'BACKWARD-V1', is_active: false }) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    prod_schedule_version: {
      findUnique: jest.fn().mockResolvedValue(versionRow),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...(versionRow as object), id: where.id, ...data })),
    },
  }
  const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) } as unknown as any
  const scheduler = { run: jest.fn().mockResolvedValue(RESULT) } as unknown as any
  const mail = { log: jest.fn().mockResolvedValue({}) } as unknown as any
  return { tx, prisma, scheduler, mail, svc: new ScheduleService(prisma, scheduler, mail) }
}

describe('bangkokNowIso', () => {
  it('renders the instant as Asia/Bangkok wall-clock time with a +07:00 offset', () => {
    expect(bangkokNowIso(new Date('2026-10-03T01:30:00.000Z'))).toBe('2026-10-03T08:30:00+07:00')
    expect(bangkokNowIso(new Date('2026-10-03T20:15:42.123Z'))).toBe('2026-10-04T03:15:42+07:00')
  })

  it('round-trips to the same instant (to the second)', () => {
    const now = new Date('2026-12-31T23:59:59.000Z')
    expect(new Date(bangkokNowIso(now)).getTime()).toBe(now.getTime())
  })
})

describe('ScheduleService.run', () => {
  it('calls the scheduler with persist=true, a +07:00 now, requested_by = JWT login, and defaults', async () => {
    const { svc, scheduler } = makeDeps()

    const result = await svc.run({ direction: 'backward' }, USER)

    expect(result).toBe(RESULT)
    const req = scheduler.run.mock.calls[0][0]
    expect(req).toMatchObject({
      direction: 'backward',
      dispatch_rule: 'EDD',
      activate: false,
      persist: true,
      requested_by: 'planner1',
    })
    expect(req.now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/)
    expect(Math.abs(new Date(req.now).getTime() - Date.now())).toBeLessThan(5_000)
  })

  it('passes dispatch_rule and activate through', async () => {
    const { svc, scheduler } = makeDeps()
    await svc.run({ direction: 'event', dispatch_rule: 'CR', activate: true }, USER)
    expect(scheduler.run.mock.calls[0][0]).toMatchObject({ direction: 'event', dispatch_rule: 'CR', activate: true })
  })

  it('audits the run on the written version with author_id = JWT sub', async () => {
    const { svc, mail } = makeDeps()
    await svc.run({ direction: 'backward', activate: true }, USER)

    expect(mail.log).toHaveBeenCalledTimes(1)
    const entry = mail.log.mock.calls[0][0]
    expect(entry).toMatchObject({
      model: 'prod_schedule_version',
      res_id: 2,
      message_type: 'audit',
      subject: 'Scheduler run',
      author_id: 7,
    })
    expect(entry.body).toContain('direction=backward')
    expect(entry.body).toContain('rule=EDD')
    expect(entry.body).toContain('activate=true')
    expect(entry.body).toContain('work_orders=125')
    expect(entry.body).toContain('late_vs_due=3')
  })

  it('does not audit when the scheduler call fails', async () => {
    const { svc, scheduler, mail } = makeDeps()
    scheduler.run.mockRejectedValue(new ConflictException('a scheduler run is already in progress'))
    await expect(svc.run({ direction: 'backward' }, USER)).rejects.toThrow(ConflictException)
    expect(mail.log).not.toHaveBeenCalled()
  })
})

describe('ScheduleService.activate', () => {
  it('throws NotFoundException (and writes nothing) when the version is missing', async () => {
    const { svc, tx, mail } = makeDeps(null)
    await expect(svc.activate(99, USER)).rejects.toThrow(NotFoundException)
    expect(tx.prod_schedule_version.updateMany).not.toHaveBeenCalled()
    expect(tx.prod_schedule_version.update).not.toHaveBeenCalled()
    expect(mail.log).not.toHaveBeenCalled()
  })

  it('takes the scheduler advisory lock (same key as engine.py) as the first statement', async () => {
    const { svc, tx } = makeDeps()
    await svc.activate(2, USER)

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    const [strings, key] = tx.$queryRaw.mock.calls[0]
    expect(strings.join('?')).toContain('pg_try_advisory_xact_lock(?)')
    expect(key).toBe(SCHEDULER_LOCK_KEY)
    expect(SCHEDULER_LOCK_KEY).toBe(5999718590924016709n)
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.prod_schedule_version.findUnique.mock.invocationCallOrder[0],
    )
  })

  it('throws ConflictException (and writes nothing) when a scheduler run holds the lock', async () => {
    const { svc, tx, mail } = makeDeps()
    tx.$queryRaw.mockResolvedValue([{ locked: false }])
    await expect(svc.activate(2, USER)).rejects.toThrow(ConflictException)
    expect(tx.prod_schedule_version.updateMany).not.toHaveBeenCalled()
    expect(tx.prod_schedule_version.update).not.toHaveBeenCalled()
    expect(mail.log).not.toHaveBeenCalled()
  })

  it('deactivates the other active versions and activates this one inside one transaction', async () => {
    const { svc, prisma, tx } = makeDeps()

    const version = await svc.activate(2, USER)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.prod_schedule_version.updateMany).toHaveBeenCalledWith({
      where: { is_active: true, id: { not: 2 } },
      data: { is_active: false },
    })
    expect(tx.prod_schedule_version.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { is_active: true } })
    const deactivateOrder = tx.prod_schedule_version.updateMany.mock.invocationCallOrder[0]
    const activateOrder = tx.prod_schedule_version.update.mock.invocationCallOrder[0]
    expect(deactivateOrder).toBeLessThan(activateOrder)
    expect(version).toMatchObject({ id: 2, is_active: true })
  })

  it('audits the activation with author_id = JWT sub', async () => {
    const { svc, mail } = makeDeps()
    await svc.activate(2, USER)
    expect(mail.log).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'prod_schedule_version', res_id: 2, message_type: 'audit', author_id: 7 }),
    )
  })
})
