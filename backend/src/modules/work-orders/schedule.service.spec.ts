import { ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  bangkokNowIso,
  BOARD_OPEN_WO_STATUSES,
  pickBoardVersionId,
  SCHEDULER_LOCK_KEY,
  ScheduleService,
} from './schedule.service'

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

describe('pickBoardVersionId', () => {
  // Deliberately not sorted, to prove "newest" means highest id, not list order.
  const versions = [
    { id: 1, is_active: false, row_count: 4 },
    { id: 3, is_active: false, row_count: 2 },
    { id: 2, is_active: true, row_count: 5 },
    { id: 4, is_active: false, row_count: 0 },
  ]

  it('uses the requested version when it exists and has rows', () => {
    expect(pickBoardVersionId(versions, 1)).toBe(1)
  })

  it('falls back to the active version when the requested one is missing or empty', () => {
    expect(pickBoardVersionId(versions, 999)).toBe(2)
    expect(pickBoardVersionId(versions, 4)).toBe(2)
    expect(pickBoardVersionId(versions)).toBe(2)
  })

  it('falls back to the newest version with rows when the active one is empty or absent', () => {
    const activeEmpty = versions.map((v) => (v.id === 2 ? { ...v, row_count: 0 } : v))
    expect(pickBoardVersionId(activeEmpty)).toBe(3)
    expect(pickBoardVersionId(versions.map((v) => ({ ...v, is_active: false })))).toBe(3)
  })

  it('returns null when no version has rows', () => {
    expect(pickBoardVersionId(versions.map((v) => ({ ...v, row_count: 0 })), 1)).toBeNull()
    expect(pickBoardVersionId([])).toBeNull()
  })
})

describe('ScheduleService.board', () => {
  const D = (v: string) => new Prisma.Decimal(v)
  const T = (iso: string) => new Date(iso)
  const ASM: Record<string, number> = { 'A-1': 901, 'B-2': 902, 'C-3': 903 }
  const part = (weight: string, mark: string) => ({
    weight_kg: D(weight),
    bom_assembly_part: { assembly_id: ASM[mark], assembly: { assembly_mark: mark } },
  })
  const liveMarks = (...marks: string[]) => marks.map((m) => ({ bom_assembly_id: ASM[m] }))
  const version = (id: number, is_active: boolean, rows: number) => ({
    id,
    version_code: `V${id}`,
    description: id === 2 ? 'backward EDD' : null,
    scheduler_source: 'python-aps',
    is_active,
    created_at: T(`2026-10-0${id}T02:00:00.000Z`),
    created_by: 'planner1',
    _count: { schedules: rows },
  })
  const wo = (id: number, status: string, over: Record<string, unknown> = {}) => ({
    id,
    wo_code: `WO-IN-${26000000 + id}`,
    mo_id: id <= 12 ? 1 : 2,
    sequence: 10,
    status,
    expected_duration_min: 120,
    setup_time_min: 15,
    plan_start: null,
    plan_finish: null,
    source_routing_op_id: null,
    subcontractor_id: null,
    team_headcount: 2,
    marks: [],
    parts: [],
    ...over,
  })

  function makeBoardDeps(over: { versions?: unknown[]; ops?: unknown[] } = {}) {
    const data = {
      versions: over.versions ?? [version(3, false, 0), version(2, true, 3), version(1, false, 1)],
      ops: over.ops ?? [
        { work_order_id: 11, workcenter_line_id: 101, start_datetime: T('2026-10-05T01:00:00Z'), end_datetime: T('2026-10-05T03:00:00Z') },
        { work_order_id: 12, workcenter_line_id: null, start_datetime: T('2026-10-05T02:00:00Z'), end_datetime: T('2026-10-05T04:30:00Z') },
        { work_order_id: 11, workcenter_line_id: 102, start_datetime: T('2026-10-06T01:00:00Z'), end_datetime: T('2026-10-06T02:00:00Z') },
      ],
      wos: [
        // 11 is DONE — on the board only because the chosen version places it.
        wo(11, 'DONE', {
          source_routing_op_id: 501,
          subcontractor_id: 7,
          team_headcount: 4,
          plan_start: T('2026-10-05T00:00:00Z'),
          plan_finish: T('2026-10-06T10:00:00Z'),
          marks: liveMarks('A-1', 'B-2'),
          parts: [part('0.1', 'B-2'), part('0.2', 'A-1'), part('1.5', 'B-2')],
        }),
        wo(12, 'RELEASED', { source_routing_op_id: 502 }),
        // C-3 was removed from 13 (soft delete) — its work_order_part rows stay behind.
        wo(13, 'NOT_STARTED', {
          source_routing_op_id: 503,
          marks: liveMarks('A-1'),
          parts: [part('2.0', 'A-1'), part('5.0', 'C-3')],
        }),
        wo(14, 'ON_HOLD'),
        wo(15, 'PAUSED', { source_routing_op_id: 999 }),
      ],
      routingOps: [
        { id: 501, op_type: { key: 'cut', label: 'Cutting' } },
        { id: 502, op_type: { key: 'weld', label: '' } },
        { id: 503, op_type: null },
      ],
      mos: [
        { id: 1, mo_code: 'MO-26000001', primary_mark_prefix_code: 'WH', plan_start: T('2026-10-01T01:00:00Z'), plan_finish: null },
        { id: 2, mo_code: 'MO-26000002', primary_mark_prefix_code: 'CO', plan_start: null, plan_finish: T('2026-11-01T09:00:00Z') },
      ],
      wcs: [
        { id: 1, code: 'WC-CUT', name: 'Cutting', active: true, availability: D('95.50'), performance: D('100.00'), quality: D('99.25'), oee_target: D('90.00') },
      ],
      lines: [{ id: 101, workcenter_id: 1, line_no: 1, name: null, active: true }],
      teams: [{ id: 7, code: 'T-EX-01', name: 'Sub A', team_type: 'external', active: true }],
      offDays: [{ date: T('2026-12-31T00:00:00Z') }, { date: T('2026-12-05T00:00:00Z') }, { date: T('2026-12-31T00:00:00Z') }],
    }
    const prisma = {
      prod_schedule_version: { findMany: jest.fn().mockResolvedValue(data.versions) },
      prod_schedule: { findMany: jest.fn().mockResolvedValue(data.ops) },
      work_order: { findMany: jest.fn().mockResolvedValue(data.wos) },
      mrp_routing_workcenter: { findMany: jest.fn().mockResolvedValue(data.routingOps) },
      manufacturing_order: { findMany: jest.fn().mockResolvedValue(data.mos) },
      mrp_workcenter: { findMany: jest.fn().mockResolvedValue(data.wcs) },
      mrp_workcenter_line: { findMany: jest.fn().mockResolvedValue(data.lines) },
      team: { findMany: jest.fn().mockResolvedValue(data.teams) },
      calendar_exception: { findMany: jest.fn().mockResolvedValue(data.offDays) },
    }
    return { prisma, svc: new ScheduleService(prisma as any, {} as any, {} as any) }
  }

  it('lists every version newest first with row_count and an ISO created_at', async () => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board()

    const args = prisma.prod_schedule_version.findMany.mock.calls[0][0]
    expect(args.orderBy).toEqual({ id: 'desc' })
    expect(args.select._count).toEqual({ select: { schedules: true } })
    expect(board.versions.map((v) => v.id)).toEqual([3, 2, 1])
    expect(board.versions[1]).toEqual({
      id: 2,
      version_code: 'V2',
      description: 'backward EDD',
      scheduler_source: 'python-aps',
      is_active: true,
      created_at: '2026-10-02T02:00:00.000Z',
      created_by: 'planner1',
      row_count: 3,
    })
  })

  it.each([
    ['no query → active version', undefined, 2],
    ['query version with rows', 1, 1],
    ['query version with no rows → active', 3, 2],
    ['unknown query version → active', 42, 2],
  ])('%s', async (_label, requested, expected) => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board(requested)
    expect(board.version_id).toBe(expected)
    expect(prisma.prod_schedule.findMany.mock.calls[0][0].where).toEqual({ prod_schedule_version_id: expected })
  })

  it('falls back to the newest version with rows when none is active', async () => {
    const { svc } = makeBoardDeps({ versions: [version(3, false, 0), version(2, false, 3), version(1, false, 1)] })
    expect((await svc.board()).version_id).toBe(2)
  })

  it('returns version_id null and no ops (without querying prod_schedule) when no version has rows', async () => {
    const { svc, prisma } = makeBoardDeps({ versions: [version(2, true, 0), version(1, false, 0)] })
    const board = await svc.board(2)

    expect(board.version_id).toBeNull()
    expect(board.ops).toEqual([])
    expect(prisma.prod_schedule.findMany).not.toHaveBeenCalled()
    // Open WOs are still on the board.
    expect(prisma.work_order.findMany.mock.calls[0][0].where.OR).toEqual([
      { id: { in: [] } },
      { status: { in: BOARD_OPEN_WO_STATUSES } },
    ])
  })

  it('maps ops start-ascending to ISO start/end with the placed line', async () => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board()

    expect(prisma.prod_schedule.findMany.mock.calls[0][0].orderBy).toEqual([{ start_datetime: 'asc' }, { id: 'asc' }])
    expect(board.ops[0]).toEqual({
      work_order_id: 11,
      workcenter_line_id: 101,
      start: '2026-10-05T01:00:00.000Z',
      end: '2026-10-05T03:00:00.000Z',
    })
    expect(board.ops[1].workcenter_line_id).toBeNull()
  })

  it('loads WOs placed by the version (distinct ids) ∪ every WO in an open status', async () => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board()

    expect(BOARD_OPEN_WO_STATUSES).toEqual(['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD'])
    expect(prisma.work_order.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.work_order.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ id: { in: [11, 12] } }, { status: { in: BOARD_OPEN_WO_STATUSES } }],
    })
    expect(board.work_orders.map((w) => w.id)).toEqual([11, 12, 13, 14, 15])
  })

  it('maps a WO: ISO plan dates, team, op_label, distinct sorted marks, Decimal weight sum', async () => {
    const { svc } = makeBoardDeps()
    const board = await svc.board()

    expect(board.work_orders[0]).toEqual({
      id: 11,
      wo_code: 'WO-IN-26000011',
      mo_id: 1,
      sequence: 10,
      status: 'DONE',
      expected_duration_min: 120,
      setup_time_min: 15,
      plan_start: '2026-10-05T00:00:00.000Z',
      plan_finish: '2026-10-06T10:00:00.000Z',
      op_label: 'Cutting',
      team_id: 7,
      team_headcount: 4,
      marks: ['A-1', 'B-2'],
      // 0.1 + 0.2 + 1.5 as floats is 1.8000000000000003 — summed as Decimal.
      weight_kg: 1.8,
    })
  })

  it('returns weight_kg null and no marks for a WO without parts', async () => {
    const { svc } = makeBoardDeps()
    const w12 = (await svc.board()).work_orders.find((w) => w.id === 12)!
    expect(w12.weight_kg).toBeNull()
    expect(w12.marks).toEqual([])
    expect(w12.plan_start).toBeNull()
    expect(w12.team_id).toBeNull()
  })

  it('counts only parts of live marks: a removed mark drops out of marks and weight_kg', async () => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board()

    // Same single WO query — live marks come along as a filtered relation.
    expect(prisma.work_order.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.work_order.findMany.mock.calls[0][0].select.marks).toEqual({
      where: { removed_at: null },
      select: { bom_assembly_id: true },
    })
    const w13 = board.work_orders.find((w) => w.id === 13)!
    expect(w13.marks).toEqual(['A-1'])
    expect(w13.weight_kg).toBe(2)
  })

  it('returns weight_kg null when every part belongs to a removed mark', async () => {
    const { svc, prisma } = makeBoardDeps()
    prisma.work_order.findMany.mockResolvedValue([wo(14, 'ON_HOLD', { parts: [part('3.0', 'C-3')] })])
    const w14 = (await svc.board()).work_orders[0]
    expect(w14.marks).toEqual([])
    expect(w14.weight_kg).toBeNull()
  })

  it('resolves op_label through routing op → op type (label || key), null on any missing link', async () => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board()

    // One query for all soft refs, distinct and non-null.
    expect(prisma.mrp_routing_workcenter.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.mrp_routing_workcenter.findMany.mock.calls[0][0].where).toEqual({ id: { in: [501, 502, 503, 999] } })
    const label = Object.fromEntries(board.work_orders.map((w) => [w.id, w.op_label]))
    expect(label).toEqual({
      11: 'Cutting', // label
      12: 'weld', // empty label → key
      13: null, // routing op without op_type
      14: null, // WO without source_routing_op_id
      15: null, // routing op no longer exists
    })
  })

  it('loads only the MOs the WOs reference, with ISO plan dates', async () => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board()

    expect(prisma.manufacturing_order.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.manufacturing_order.findMany.mock.calls[0][0].where).toEqual({ id: { in: [1, 2] } })
    expect(board.mos).toEqual([
      { id: 1, mo_code: 'MO-26000001', primary_mark_prefix_code: 'WH', plan_start: '2026-10-01T01:00:00.000Z', plan_finish: null },
      { id: 2, mo_code: 'MO-26000002', primary_mark_prefix_code: 'CO', plan_start: null, plan_finish: '2026-11-01T09:00:00.000Z' },
    ])
  })

  it('returns work centers with Decimal OEE fields as numbers, plus lines and teams', async () => {
    const { svc } = makeBoardDeps()
    const board = await svc.board()

    expect(board.work_centers).toEqual([
      { id: 1, code: 'WC-CUT', name: 'Cutting', active: true, availability: 95.5, performance: 100, quality: 99.25, oee_target: 90 },
    ])
    expect(typeof board.work_centers[0].availability).toBe('number')
    expect(board.lines).toEqual([{ id: 101, workcenter_id: 1, line_no: 1, name: null, active: true }])
    expect(board.teams).toEqual([{ id: 7, code: 'T-EX-01', name: 'Sub A', team_type: 'external', active: true }])
  })

  it('returns holidays as distinct sorted YYYY-MM-DD of non-working calendar exceptions', async () => {
    const { svc, prisma } = makeBoardDeps()
    const board = await svc.board()

    expect(prisma.calendar_exception.findMany.mock.calls[0][0].where).toEqual({ is_working: false })
    expect(board.holidays).toEqual(['2026-12-05', '2026-12-31'])
  })

  it('stamps generated_at with the server time (ISO)', async () => {
    const { svc } = makeBoardDeps()
    const board = await svc.board()
    expect(board.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(Math.abs(new Date(board.generated_at).getTime() - Date.now())).toBeLessThan(5_000)
  })
})
