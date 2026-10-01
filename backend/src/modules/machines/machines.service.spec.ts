import { ConflictException, NotFoundException } from '@nestjs/common'
import { MachinesService } from './machines.service'

// Operator status + Team (2026-09-22) — user: "เพิ่ม column team และเพิ่ม
// status active หรือ inactive และทำให้สามารถ กด เปลี่ยน status และสามารถดูได้
// ว่าใคร active หรือ inactive ในหน้า operator จะแบ่งด้านในย่อย เป็น 2 tab มี
// team ว่ามี team อะไรบ้าง และ tab operator เป็น รายชื่อ พนักงานทั้งหมด"
// `team` is the renamed (dormant) `subcontractor` table; `operator.team_id`
// is a new FK. These tests only cover the operator/team surface touched by
// that request — the rest of MachinesService is unchanged.

function makeOperatorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, code: 'OP-001', name: 'Somchai', nationality: 'TH',
    position_raw: 'Welder B', start_raw: '2023-02-20', active: true,
    team: null, skills: [],
    ...overrides,
  }
}

describe('MachinesService.findAllOperators', () => {
  it('lists every operator regardless of active status, selecting active + team', async () => {
    const findMany = jest.fn().mockResolvedValue([makeOperatorRow(), makeOperatorRow({ id: 2, active: false })])
    const prisma: any = { operator: { findMany } }
    const svc = new MachinesService(prisma, {} as any)

    const result = await svc.findAllOperators()

    const callArg = findMany.mock.calls[0][0]
    expect(callArg.where).toBeUndefined()
    expect(callArg.select).toEqual(expect.objectContaining({
      active: true,
      team: expect.objectContaining({ select: expect.objectContaining({ id: true, code: true, name: true }) }),
    }))
    expect(result).toHaveLength(2)
  })
})

describe('MachinesService.createOperator', () => {
  function makeTx(created: Record<string, unknown>) {
    return {
      operator: {
        create: jest.fn().mockResolvedValue(created),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...created }),
      },
      operator_skill: { createMany: jest.fn().mockResolvedValue({}) },
    }
  }

  it('stores the given team_id', async () => {
    const tx = makeTx({ id: 5 })
    const prisma: any = { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)) }
    const svc = new MachinesService(prisma, {} as any)

    await svc.createOperator({ code: 'OP-005', name: 'Somsri', team_id: 3 } as any)

    expect(tx.operator.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ team_id: 3 }),
    })
  })

  it('defaults team_id to null when omitted', async () => {
    const tx = makeTx({ id: 6 })
    const prisma: any = { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)) }
    const svc = new MachinesService(prisma, {} as any)

    await svc.createOperator({ code: 'OP-006', name: 'Somying' } as any)

    expect(tx.operator.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ team_id: null }),
    })
  })
})

describe('MachinesService.updateOperator', () => {
  function makeTx(row: Record<string, unknown>) {
    return {
      operator: {
        update: jest.fn().mockResolvedValue(row),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
      },
      operator_skill: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    }
  }

  it('throws NotFoundException when the operator does not exist', async () => {
    const prisma: any = { operator: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new MachinesService(prisma, {} as any)

    await expect(svc.updateOperator(99, {})).rejects.toBeInstanceOf(NotFoundException)
  })

  it('reassigns team_id and toggles active when both are provided', async () => {
    const row = makeOperatorRow()
    const tx = makeTx(row)
    const prisma: any = {
      operator: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    }
    const svc = new MachinesService(prisma, {} as any)

    await svc.updateOperator(1, { team_id: 4, active: false } as any)

    expect(tx.operator.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ team_id: 4, active: false }),
    })
  })

  it('clears the team when team_id is explicitly null', async () => {
    const row = makeOperatorRow()
    const tx = makeTx(row)
    const prisma: any = {
      operator: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    }
    const svc = new MachinesService(prisma, {} as any)

    await svc.updateOperator(1, { team_id: null } as any)

    expect(tx.operator.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ team_id: null }),
    })
  })

  it('leaves team_id and active untouched when omitted', async () => {
    const row = makeOperatorRow()
    const tx = makeTx(row)
    const prisma: any = {
      operator: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    }
    const svc = new MachinesService(prisma, {} as any)

    await svc.updateOperator(1, { name: 'New Name' } as any)

    const dataArg = tx.operator.update.mock.calls[0][0].data
    expect(dataArg).not.toHaveProperty('team_id')
    expect(dataArg).not.toHaveProperty('active')
  })
})

describe('MachinesService.findAllTeams / createTeam / updateTeam', () => {
  it('lists teams ordered by id', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 1, code: 'TEAM-A', name: 'Team A', active: true }])
    const prisma: any = { team: { findMany } }
    const svc = new MachinesService(prisma, {} as any)

    const result = await svc.findAllTeams()

    expect(findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } })
    expect(result).toHaveLength(1)
  })

  it('creates a team as active by default', async () => {
    const create = jest.fn().mockResolvedValue({ id: 2, code: 'TEAM-B', name: 'Team B', team_type: 'internal', active: true })
    const prisma: any = { team: { create } }
    const svc = new MachinesService(prisma, {} as any)

    await svc.createTeam({ code: 'TEAM-B', name: 'Team B', team_type: 'internal' })

    expect(create).toHaveBeenCalledWith({ data: { code: 'TEAM-B', name: 'Team B', team_type: 'internal', active: true } })
  })

  it('throws NotFoundException updating a missing team', async () => {
    const prisma: any = { team: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new MachinesService(prisma, {} as any)

    await expect(svc.updateTeam(99, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('updates only the given fields', async () => {
    const existing = { id: 3, code: 'TEAM-C', name: 'Team C', active: true }
    const update = jest.fn().mockResolvedValue({ ...existing, active: false })
    const prisma: any = { team: { findUnique: jest.fn().mockResolvedValue(existing), update } }
    const svc = new MachinesService(prisma, {} as any)

    await svc.updateTeam(3, { active: false })

    expect(update).toHaveBeenCalledWith({ where: { id: 3 }, data: { active: false } })
  })

  // WO codes carry IN/EX from team_type at creation (2026-10-01), so the type is
  // locked once the team has work orders — same rule shape as deleteTeam().
  it('409s changing team_type once the team has work orders', async () => {
    const update = jest.fn()
    const prisma: any = {
      team: { findUnique: jest.fn().mockResolvedValue({ id: 3, team_type: 'internal' }), update },
      work_order: { count: jest.fn().mockResolvedValue(2) },
    }
    const svc = new MachinesService(prisma, {} as any)

    await expect(svc.updateTeam(3, { team_type: 'external' })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.work_order.count).toHaveBeenCalledWith({ where: { subcontractor_id: 3 } })
    expect(update).not.toHaveBeenCalled()
  })

  it('allows changing team_type while the team has no work orders, and re-sending the same type', async () => {
    const update = jest.fn().mockResolvedValue({})
    const count = jest.fn().mockResolvedValue(0)
    const prisma: any = {
      team: { findUnique: jest.fn().mockResolvedValue({ id: 3, team_type: 'internal' }), update },
      work_order: { count },
    }
    const svc = new MachinesService(prisma, {} as any)

    await svc.updateTeam(3, { team_type: 'external' })
    expect(update).toHaveBeenCalledWith({ where: { id: 3 }, data: { team_type: 'external' } })

    count.mockResolvedValue(5)
    await svc.updateTeam(3, { team_type: 'internal', name: 'Renamed' })
    expect(update).toHaveBeenLastCalledWith({ where: { id: 3 }, data: { name: 'Renamed', team_type: 'internal' } })
  })

  it('throws NotFoundException deleting a missing team', async () => {
    const prisma: any = { team: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new MachinesService(prisma, {} as any)

    await expect(svc.deleteTeam(99)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('blocks deleting a team still referenced by an operator or work order', async () => {
    const prisma: any = {
      team: { findUnique: jest.fn().mockResolvedValue({ id: 4 }), delete: jest.fn() },
      operator: { count: jest.fn().mockResolvedValue(2) },
      work_order: { count: jest.fn().mockResolvedValue(1) },
    }
    const svc = new MachinesService(prisma, {} as any)

    await expect(svc.deleteTeam(4)).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.team.delete).not.toHaveBeenCalled()
  })

  it('deletes a team with no references', async () => {
    const prisma: any = {
      team: { findUnique: jest.fn().mockResolvedValue({ id: 5 }), delete: jest.fn().mockResolvedValue(undefined) },
      operator: { count: jest.fn().mockResolvedValue(0) },
      work_order: { count: jest.fn().mockResolvedValue(0) },
    }
    const svc = new MachinesService(prisma, {} as any)

    await svc.deleteTeam(5)

    expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })
})
