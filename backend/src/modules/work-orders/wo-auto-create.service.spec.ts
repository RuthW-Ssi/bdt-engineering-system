import { BadRequestException, NotFoundException } from '@nestjs/common'
import { WorkOrderAutoCreateService } from './wo-auto-create.service'

// Multi-mark redesign (2026-09-17): createForMo() (auto-create-on-confirm) is
// gone — this file tests its manual replacement, createOrAddMarks() (find-or-
// create the WO for one (mo, operation) pair, then attach assembly lines to
// it as work_order_mark rows, idempotently), and recomputeDuration() (the
// "Plan time" sum-across-marks formula it calls at the end).

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    template_id: 1,
    sequence: 10,
    workcenter_id: 5,
    activities_snapshot: null,
    operation_template: {
      activities: [
        { id: 1, name: 'Weld', measure: 'mm', per_minute: 2, source_activity_id: 501, tools: [], skills: [] },
      ],
    },
    ...overrides,
  }
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    mo_id: 1,
    bom_assembly_id: 100,
    qty: 5,
    bom_assembly: { id: 100, dispatch_id: 10 },
    ...overrides,
  }
}

/** Three call shapes share the same `work_order_mark.findMany` delegate — branch
 *  on a field unique to each so each test can control all three independently:
 *  - existing-marks-on-this-WO check: `where: { work_order_id }` only (no `removed_at`).
 *  - recompute's non-removed-marks query: `where: { work_order_id, removed_at: null }`.
 *  - computeMarkBudget()'s sibling-WO query (2026-09-23): `where: { bom_assembly_id, ... }`
 *    — no top-level `work_order_id` at all (it's nested under `work_order: {...}`).
 *  Defaulting `budgetMarks` to `[]` reproduces the pre-2026-09-23 behavior (nothing
 *  committed on a sibling WO → remaining == total), so no pre-existing test needs to
 *  know this third shape exists unless it specifically cares. */
function makeMarkFindMany(existingMarks: { bom_assembly_id: number }[] = [], recomputeMarks: any[] = [], budgetMarks: { qty_planned: number }[] = []) {
  return jest.fn().mockImplementation(({ where }: any) => {
    if (where.bom_assembly_id !== undefined) return Promise.resolve(budgetMarks)
    if (where.removed_at !== undefined) return Promise.resolve(recomputeMarks)
    return Promise.resolve(existingMarks)
  })
}

function makeTx(overrides: Record<string, unknown> = {}) {
  const tx: any = {
    manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, routing_template_id: 1 }) },
    mrp_routing_workcenter: { findUnique: jest.fn().mockResolvedValue(makeOp()) },
    mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeLine()]) },
    work_order: {
      // First call: find-or-create check (where.mo_id_source_routing_op_id) → none yet.
      // Second call: recomputeDuration()'s own lookup (where.id) → the just-created row.
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.mo_id_source_routing_op_id) return Promise.resolve(null)
        if (where.id) return Promise.resolve({ id: where.id, op_attributes: { activities: [] } })
        return Promise.resolve(null)
      }),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 900, ...data })),
      update: jest.fn(),
    },
    work_order_mark: { findMany: makeMarkFindMany(), create: jest.fn().mockResolvedValue({}) },
    activity: {
      findMany: jest.fn().mockResolvedValue([{ id: 501, formula_code: 'weld_length_mm', per_minute: 2, duration_min: 0, kind: 'run' }]),
    },
    // recomputeConsume's own lookups — empty by default (no consume formulas
    // configured for the fixture activity), so these createOrAddMarks tests
    // (not concerned with consume) exercise it harmlessly. See the dedicated
    // 'WorkOrderAutoCreateService.recomputeConsume' describe block below for
    // real coverage of the material-consume math itself.
    activity_consume: { findMany: jest.fn().mockResolvedValue([]) },
    work_order_consume: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    // recomputeParts' own lookups — empty by default (no bom_assembly_part rows
    // configured for the fixture assembly), harmless for these createOrAddMarks
    // tests. See the dedicated 'WorkOrderAutoCreateService.recomputeParts'
    // describe block below for real coverage.
    bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
    work_order_part: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    // Single atomic upsert now (INSERT ... ON CONFLICT ... RETURNING), not a
    // separate SELECT-FOR-UPDATE + UPDATE pair — see wo-auto-create.service.ts's
    // createOrAddMarks() comment (2026-09-28, wo_code year-prefix change).
    $queryRaw: jest.fn().mockResolvedValue([{ allocated: 900 }]),
    // wo_code carries IN/EX from the chosen team's team_type (2026-10-01).
    team: { findUnique: jest.fn().mockResolvedValue({ team_type: 'internal' }) },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return tx
}

describe('WorkOrderAutoCreateService.createOrAddMarks', () => {
  it('creates a new WO + marks, allocating a wo_code via the code sequence', async () => {
    const tx = makeTx()
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')

    // wo_code is WO-IN|EX-YYNNNNNN — the year comes from the real wall clock
    // (not injectable), so compute the expected prefix the same way the
    // service does rather than hardcoding a year that goes stale. No team
    // given → IN (2026-10-01).
    const year = (new Date().getFullYear() % 100).toString().padStart(2, '0')
    const expectedCode = `WO-IN-${year}000900`

    // Always creates fresh, no find-or-create lookup by (mo, operation) at
    // all (2026-09-23: an operation may have several WOs, and there's no
    // way to add marks to an already-created one — "สร้าง wo แล้วไม่ควรเพิ่ม
    // mark ทีหลังได้"). findUnique still gets called below, by id, from
    // recomputeDuration()/recomputeConsume() re-reading the just-created
    // WO's op_attributes.
    expect(tx.work_order.findUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { mo_id_source_routing_op_id: expect.anything() } }))
    expect(tx.$queryRaw).toHaveBeenCalled()
    expect(tx.work_order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wo_code: expectedCode, mo_id: 1, source_routing_op_id: 1, work_center_id: 5,
          status: 'NOT_STARTED', created_by: 'tester',
        }),
      }),
    )
    expect(tx.work_order_mark.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 900, bom_assembly_id: 100, bom_dispatch_id_snapshot: 10, created_by: 'tester' }),
    })
    expect(result).toEqual({ work_order_id: 900, wo_code: expectedCode, marks_added: 1 })
  })

  // Structured Team picker (2026-09-22) — user: "ทีมดึงมาทำเป็น dropdown".
  // The Create WO form's Team field now submits team_id (FK to `team`,
  // renamed from `subcontractor`) instead of a free-text assigned_to guess.
  it('sets subcontractor_id from teamId on a newly created WO', async () => {
    const tx = makeTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester', undefined, undefined, undefined, 7)

    expect(tx.work_order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subcontractor_id: 7 }) }),
    )
  })

  // IN/EX tag in wo_code (2026-10-01) — user: "ตอนสร้าง wo ต้องใส่ in หรือ ex
  // ในwo id เพื่อให้รู้ด้วยว่า wo นี้เป็นงานของ ทีม ภายใน หรือภายนอก". Derived
  // from the chosen team's team_type; one shared per-year counter for both.
  it.each([
    ['internal', 'IN'],
    ['external', 'EX'],
  ])('tags wo_code from a %s team as %s, sharing the per-year counter', async (teamType, tag) => {
    const tx = makeTx({ team: { findUnique: jest.fn().mockResolvedValue({ team_type: teamType }) } })
    const svc = new WorkOrderAutoCreateService()
    const year = (new Date().getFullYear() % 100).toString().padStart(2, '0')

    const result = await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester', undefined, undefined, undefined, 7)

    expect(tx.team.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { team_type: true } })
    expect(result.wo_code).toBe(`WO-${tag}-${year}000900`)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('defaults subcontractor_id to null when no team is given', async () => {
    const tx = makeTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')

    expect(tx.work_order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subcontractor_id: null }) }),
    )
  })

  it('stores plan_start/plan_finish on a newly created WO when given', async () => {
    const tx = makeTx()
    const svc = new WorkOrderAutoCreateService()
    const planStart = new Date('2026-10-01T02:00:00Z')
    const planFinish = new Date('2026-10-05T10:00:00Z')

    await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester', undefined, planStart, planFinish)

    expect(tx.work_order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan_start: planStart, plan_finish: planFinish }),
      }),
    )
  })

  it('defaults plan_start/plan_finish to null on a newly created WO when omitted', async () => {
    const tx = makeTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')

    expect(tx.work_order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan_start: null, plan_finish: null }),
      }),
    )
  })

  // 2026-09-23: "สร้าง wo แล้วไม่ควรเพิ่ม mark ทีหลังได้" (once a WO is
  // created, you should not be able to add marks to it later) — every call
  // creates a brand-new WO, unconditionally; there is no "target an existing
  // WO" mode any more (removed the same day it was added, once the user
  // clarified marks must be fixed at creation, not just team/plan dates).
  it('calling twice always creates two separate WOs (never finds-or-reuses one)', async () => {
    const tx = makeTx()
    const svc = new WorkOrderAutoCreateService()

    const first = await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')
    const second = await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')

    expect(first.work_order_id).toBe(900)
    expect(second.work_order_id).toBe(900) // same mocked $queryRaw result both times — real DB would differ; what matters is create() ran twice
    expect(tx.work_order.create).toHaveBeenCalledTimes(2)
  })

  it('404s when the MO does not exist', async () => {
    const tx = makeTx({ manufacturing_order: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.createOrAddMarks(tx, 999, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')).rejects.toThrow(NotFoundException)
  })

  it('404s when the operation does not exist', async () => {
    const tx = makeTx({ mrp_routing_workcenter: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.createOrAddMarks(tx, 1, 999, [{ assembly_line_id: 1, qty: 1 }], 'tester')).rejects.toThrow(NotFoundException)
  })

  it("400s when the operation does not belong to the MO's bound routing template", async () => {
    const tx = makeTx({ mrp_routing_workcenter: { findUnique: jest.fn().mockResolvedValue(makeOp({ template_id: 2 })) } }) // MO bound to template 1
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')).rejects.toThrow(BadRequestException)
  })

  it('400s when an assembly_line_id does not belong to the MO', async () => {
    const tx = makeTx({ mo_assembly_line: { findMany: jest.fn().mockResolvedValue([]) } }) // none found
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')).rejects.toThrow(BadRequestException)
  })

  it('400s when the requested qty exceeds the mark\'s own mo_assembly_line.qty (2026-09-17: qty is user-specified, capped at what the MO actually calls for)', async () => {
    const tx = makeTx() // makeLine() defaults to qty: 5
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 6 }], 'tester')).rejects.toThrow(BadRequestException)
    expect(tx.work_order_mark.create).not.toHaveBeenCalled()
  })

  it('accepts a qty lower than mo_assembly_line.qty and persists exactly that qty_planned', async () => {
    const tx = makeTx() // makeLine() defaults to qty: 5
    const svc = new WorkOrderAutoCreateService()

    await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 3 }], 'tester')

    expect(tx.work_order_mark.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ qty_planned: 3 }),
    })
  })

  // 2026-09-23 bug fix — user: "DBN-B1-CTR2 มี 1 qty ทำไมถึงสร้างเกินจำนวนใน mo
  // ได้": the multi-WO-per-operation feature let the SAME mark be re-picked on
  // a brand-new sibling WO of the same operation with no awareness that
  // another WO of that operation had already committed some/all of its
  // mo_assembly_line.qty — reproduced live (WO-00000156 + WO-00000159, both
  // Operation 010 of MO-00017, both qty_planned=1 for a mark whose
  // mo_assembly_line.qty is 1). assertMarkBudgets()/computeMarkBudget() close
  // this gap; these two tests are the failing-then-passing case for it.
  it("400s when a sibling WO of the SAME operation already committed the mark's full qty (2026-09-23: DBN-B1-CTR2 over-commitment bug)", async () => {
    const tx = makeTx({
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeLine({ qty: 1 })]) }, // MO calls for exactly 1 piece of this mark
      work_order_mark: { findMany: makeMarkFindMany([], [], [{ qty_planned: 1 }]), create: jest.fn() }, // a sibling WO of this op already committed all of it
    })
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester')).rejects.toThrow(BadRequestException)
    expect(tx.work_order_mark.create).not.toHaveBeenCalled()
    expect(tx.work_order.create).not.toHaveBeenCalled() // rejected before the new WO is even created
  })

  it('creates successfully when the request fits within what sibling WOs of the operation have left (2026-09-23)', async () => {
    const tx = makeTx({
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeLine({ qty: 3 })]) }, // MO calls for 3 pieces
      work_order_mark: { findMany: makeMarkFindMany([], [], [{ qty_planned: 1 }]), create: jest.fn().mockResolvedValue({}) }, // 1 already committed elsewhere → 2 left
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.createOrAddMarks(tx, 1, 1, [{ assembly_line_id: 1, qty: 2 }], 'tester')

    expect(tx.work_order_mark.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ qty_planned: 2 }),
    })
  })
})

describe('WorkOrderAutoCreateService.recomputeDuration', () => {
  function makeRecomputeTx(overrides: Record<string, unknown> = {}) {
    const tx: any = {
      work_order: { findUnique: jest.fn(), update: jest.fn() },
      activity: { findMany: jest.fn().mockResolvedValue([]) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    }
    return tx
  }

  it('sums run_min × qty_planned across all non-removed marks; setup is counted ONCE per WO, rounded once at the end', async () => {
    const tx = makeRecomputeTx({
      work_order: {
        findUnique: jest.fn().mockResolvedValue({
          op_attributes: {
            activities: [
              { name: 'Weld', source_activity_id: 501 },
              { name: 'Setup', source_activity_id: 502 },
            ],
          },
        }),
        update: jest.fn(),
      },
      activity: {
        findMany: jest.fn().mockResolvedValue([
          { id: 501, formula_code: 'weld_length_mm', per_minute: 2, duration_min: 0, kind: 'run' }, // 1000mm / 2 = 500 min per unit
          { id: 502, formula_code: null, per_minute: null, duration_min: 15, kind: 'setup' },
        ]),
      },
      work_order_mark: {
        findMany: jest.fn().mockResolvedValue([
          { qty_planned: 2, bom_assembly: { length_mm: 1000, surface_area_m2: null, width_mm: null } }, // 500 × 2 = 1000
          { qty_planned: 3, bom_assembly: { length_mm: 100, surface_area_m2: null, width_mm: null } }, //  50 × 3 =  150
        ]),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.recomputeDuration(tx, 900)

    // 1000 + 150 = 1150 total run; setup fixed at 15 regardless of mark count.
    expect(result).toEqual({ expected_duration_min: 1150, setup_time_min: 15 })
    expect(tx.work_order.update).toHaveBeenCalledWith({
      where: { id: 900 },
      data: { expected_duration_min: 1150, setup_time_min: 15 },
    })
  })

  it('this is also the bug fix: qty_planned actually multiplies run_min (a single mark with qty_planned=4 is 4× a qty_planned=1 mark)', async () => {
    const baseTx = (qty: number) =>
      makeRecomputeTx({
        work_order: { findUnique: jest.fn().mockResolvedValue({ op_attributes: { activities: [{ name: 'Weld', source_activity_id: 501 }] } }), update: jest.fn() },
        activity: { findMany: jest.fn().mockResolvedValue([{ id: 501, formula_code: 'weld_length_mm', per_minute: 1, duration_min: 0, kind: 'run' }]) },
        work_order_mark: { findMany: jest.fn().mockResolvedValue([{ qty_planned: qty, bom_assembly: { length_mm: 100, surface_area_m2: null, width_mm: null } }]) },
      })
    const svc = new WorkOrderAutoCreateService()

    const single = await svc.recomputeDuration(baseTx(1), 900)
    const quadruple = await svc.recomputeDuration(baseTx(4), 900)

    expect(single.expected_duration_min).toBe(100)
    expect(quadruple.expected_duration_min).toBe(400)
  })

  it('clamps to a minimum of 1 minute when there are no non-removed marks (or no resolvable activities)', async () => {
    const tx = makeRecomputeTx({
      work_order: { findUnique: jest.fn().mockResolvedValue({ op_attributes: { activities: [] } }), update: jest.fn() },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]) },
    })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.recomputeDuration(tx, 900)

    expect(result).toEqual({ expected_duration_min: 1, setup_time_min: 0 })
  })

  it('404s when the WO does not exist', async () => {
    const tx = makeRecomputeTx({ work_order: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.recomputeDuration(tx, 999)).rejects.toThrow(NotFoundException)
  })
})

describe('WorkOrderAutoCreateService.recomputeConsume', () => {
  function makeConsumeTx(overrides: Record<string, unknown> = {}) {
    const tx: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ op_attributes: { activities: [{ source_activity_id: 501 }] } }) },
      activity_consume: {
        findMany: jest.fn().mockResolvedValue([
          { activity_id: 501, material: { id: 200 }, formula: { expr: 'length', result_unit: 'm' } }, // 1 unit per meter of length
        ]),
      },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([{ qty_planned: 2, bom_assembly: { length_mm: 1000, surface_area_m2: null, weight_kg: null } }]) }, // 1m × 2 = 2
      work_order_consume: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      ...overrides,
    }
    return tx
  }

  it('creates a new work_order_consume row with qty_actual defaulted to the computed qty_planned', async () => {
    const tx = makeConsumeTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeConsume(tx, 900, 'tester')

    expect(tx.work_order_consume.create).toHaveBeenCalledTimes(1)
    const createdData = tx.work_order_consume.create.mock.calls[0][0].data
    expect(createdData).toEqual(expect.objectContaining({ work_order_id: 900, material_id: 200, unit: 'm', created_by: 'tester' }))
    expect(Number(createdData.qty_planned)).toBe(2)
    expect(Number(createdData.qty_actual)).toBe(2)
  })

  it('updates qty_planned but leaves qty_actual untouched when a work_order_consume row already exists (actual is user-owned once set)', async () => {
    const tx = makeConsumeTx({
      work_order_consume: {
        findMany: jest.fn().mockResolvedValue([{ material_id: 200 }]),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeConsume(tx, 900, 'tester')

    expect(tx.work_order_consume.create).not.toHaveBeenCalled()
    expect(tx.work_order_consume.update).toHaveBeenCalledWith({
      where: { work_order_id_material_id: { work_order_id: 900, material_id: 200 } },
      data: expect.objectContaining({ unit: 'm', updated_by: 'tester' }),
    })
    const updateData = tx.work_order_consume.update.mock.calls[0][0].data
    expect(Number(updateData.qty_planned)).toBe(2)
    expect(updateData.qty_actual).toBeUndefined() // not touched
  })

  it('sums a material across multiple marks, scaled by each mark\'s own qty_planned, then rounds to a whole unit (2026-09-21)', async () => {
    const tx = makeConsumeTx({
      work_order_mark: {
        findMany: jest.fn().mockResolvedValue([
          { qty_planned: 2, bom_assembly: { length_mm: 1000, surface_area_m2: null, weight_kg: null } }, // 1m × 2 = 2
          { qty_planned: 3, bom_assembly: { length_mm: 500, surface_area_m2: null, weight_kg: null } }, // 0.5m × 3 = 1.5
        ]),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeConsume(tx, 900, 'tester')

    const createdData = tx.work_order_consume.create.mock.calls[0][0].data
    expect(Number(createdData.qty_planned)).toBe(4) // raw sum 3.5, rounded to the nearest whole unit
  })

  it('skips materials with a zero/non-positive computed qty (no row created)', async () => {
    const tx = makeConsumeTx({
      work_order_mark: { findMany: jest.fn().mockResolvedValue([{ qty_planned: 2, bom_assembly: { length_mm: 0, surface_area_m2: null, weight_kg: null } }]) },
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeConsume(tx, 900, 'tester')

    expect(tx.work_order_consume.create).not.toHaveBeenCalled()
    expect(tx.work_order_consume.update).not.toHaveBeenCalled()
  })

  it('404s when the WO does not exist', async () => {
    const tx = makeConsumeTx({ work_order: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.recomputeConsume(tx, 999, 'tester')).rejects.toThrow(NotFoundException)
  })
})

// Preview's consume list (2026-09-22) — user: "ทำไม routing หน้า overview mo
// มี consume แต่พอจะสร้าง wo ไม่มี consume". Root cause: activity_consume rows
// with no formula_id (a material declared as "used here" in the Activity
// Library with no way to compute a quantity) used to be silently dropped
// here, while the MO overview's Routing card lists them regardless (plain
// reference, no formula required) — the two disagreed for the exact same
// operation. Fixed to surface them with qty: null instead of hiding them.
describe('WorkOrderAutoCreateService.previewMarksImpact', () => {
  function makeAssemblyLine(overrides: Record<string, unknown> = {}) {
    return makeLine({
      bom_assembly: { id: 100, assembly_mark: 'WH-CO-001', length_mm: 1000, surface_area_m2: null, weight_kg: null },
      ...overrides,
    })
  }

  it('includes a material with no formula as qty: null instead of dropping it', async () => {
    const tx = makeTx({
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeAssemblyLine()]) },
      activity_consume: {
        findMany: jest.fn().mockResolvedValue([
          { activity_id: 501, material: { id: 200, default_code: 'BIF81100056', name: 'ลวดเชื่อมไฟฟ้า LB-52' }, formula: null },
        ]),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }])

    expect(result.consume).toEqual([
      { material_id: 200, code: 'BIF81100056', name: 'ลวดเชื่อมไฟฟ้า LB-52', qty: null, unit: null },
    ])
  })

  it('still computes a numeric qty when a formula is present (unchanged behavior)', async () => {
    const tx = makeTx({
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeAssemblyLine()]) },
      activity_consume: {
        findMany: jest.fn().mockResolvedValue([
          { activity_id: 501, material: { id: 200, default_code: 'M1', name: 'Material' }, formula: { expr: 'length', result_unit: 'm' } },
        ]),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }])

    expect(result.consume).toEqual([{ material_id: 200, code: 'M1', name: 'Material', qty: 1, unit: 'm' }])
  })

  it('still drops a material whose formula evaluates to zero (not the same as "no formula")', async () => {
    const tx = makeTx({
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeAssemblyLine({ bom_assembly: { id: 100, assembly_mark: 'WH-CO-001', length_mm: 0, surface_area_m2: null, weight_kg: null } })]) },
      activity_consume: {
        findMany: jest.fn().mockResolvedValue([
          { activity_id: 501, material: { id: 200, default_code: 'M1', name: 'Material' }, formula: { expr: 'length', result_unit: 'm' } },
        ]),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }])

    expect(result.consume).toEqual([])
  })

  it('does not duplicate a material that has both a computed row and a no-formula row for the same op', async () => {
    const tx = makeTx({
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeAssemblyLine()]) },
      activity_consume: {
        findMany: jest.fn().mockResolvedValue([
          { activity_id: 501, material: { id: 200, default_code: 'M1', name: 'Material' }, formula: { expr: 'length', result_unit: 'm' } },
          { activity_id: 501, material: { id: 200, default_code: 'M1', name: 'Material' }, formula: null },
        ]),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }])

    expect(result.consume).toEqual([{ material_id: 200, code: 'M1', name: 'Material', qty: 1, unit: 'm' }])
  })

  // 2026-09-23: "plan finish user ไม่ต้องกรอกเองตอนสร้าง wo เพราะระบบจะ
  // คำนวณให้จาก routing ที่มี plan duration" — Create WO's Plan Finish is
  // now Plan Start + this, auto-computed instead of free-entry. Same math
  // as recomputeDuration() (see that describe block for the formula_code →
  // contribution mapping); resolved fresh here since there's no existing WO
  // to read op_attributes back from yet during a preview.
  describe('duration', () => {
    it("computes expected_duration_min/setup_time_min the same way recomputeDuration() would (1000mm / 2 per_minute = 500)", async () => {
      const tx = makeTx({ mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeAssemblyLine()]) } })
      const svc = new WorkOrderAutoCreateService()

      const result = await svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }])

      expect(result.expected_duration_min).toBe(500)
      expect(result.setup_time_min).toBe(0)
    })

    it('scales run time by the requested qty (500 × 3 = 1500), same as recomputeDuration()', async () => {
      const tx = makeTx({ mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeAssemblyLine()]) } })
      const svc = new WorkOrderAutoCreateService()

      const result = await svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 3 }])

      expect(result.expected_duration_min).toBe(1500)
    })

    it('counts setup once per WO regardless of how many marks are selected', async () => {
      const tx = makeTx({
        mrp_routing_workcenter: {
          findUnique: jest.fn().mockResolvedValue(makeOp({
            operation_template: {
              activities: [
                { id: 1, name: 'Weld', measure: 'mm', per_minute: 2, source_activity_id: 501, tools: [], skills: [] },
                { id: 2, name: 'Setup', measure: null, per_minute: null, source_activity_id: 502, tools: [], skills: [] },
              ],
            },
          })),
        },
        mo_assembly_line: {
          findMany: jest.fn().mockResolvedValue([
            makeAssemblyLine({ id: 1 }),
            makeAssemblyLine({ id: 2, bom_assembly: { id: 101, assembly_mark: 'WH-CO-002', length_mm: 100, surface_area_m2: null, weight_kg: null } }),
          ]),
        },
        activity: {
          findMany: jest.fn().mockResolvedValue([
            { id: 501, formula_code: 'weld_length_mm', per_minute: 2, duration_min: 0, kind: 'run' },
            { id: 502, formula_code: null, per_minute: null, duration_min: 15, kind: 'setup' },
          ]),
        },
      })
      const svc = new WorkOrderAutoCreateService()

      const result = await svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }, { assembly_line_id: 2, qty: 1 }])

      // 1000/2=500 + 100/2=50 → 550 run; setup fixed at 15 regardless of mark count.
      expect(result.expected_duration_min).toBe(550)
      expect(result.setup_time_min).toBe(15)
    })
  })

  // 2026-09-23 bug fix (see the matching createOrAddMarks tests above for the
  // full user-quote context) — the preview must reject exactly what the real
  // create would, so the Create WO form's submit-time error (not a silent
  // over-commit) is what the user actually sees.
  it("400s when a sibling WO of the SAME operation already committed the mark's full qty", async () => {
    const tx = makeTx({
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([makeAssemblyLine({ qty: 1 })]) },
      work_order_mark: { findMany: makeMarkFindMany([], [], [{ qty_planned: 1 }]) },
    })
    const svc = new WorkOrderAutoCreateService()

    await expect(svc.previewMarksImpact(tx, 1, 1, [{ assembly_line_id: 1, qty: 1 }])).rejects.toThrow(BadRequestException)
  })
})

describe('WorkOrderAutoCreateService.recomputeParts', () => {
  // bomAssemblyPartLookup: id -> {qty, weight_kg} — backs computePartBudget's
  // findUniqueOrThrow (distinct from bom_assembly_part.findMany, which finds
  // ALL parts for a mark). moLineQty defaults generously large (999) so the
  // budget cap never binds unless a test deliberately shrinks it or adds
  // "committed" rows from other WOs — matches "no other WO has claimed
  // anything yet" for tests not specifically about the 2026-09-18 cap.
  // weight_kg stays in the lookup purely so recomputeParts can derive its
  // stored (display-only) weight_kg from qty × per-piece weight — it plays
  // no part in the budget math itself (2026-09-21: qty-primary).
  function makePartsTx(overrides: Record<string, unknown> = {}) {
    const bomAssemblyPartLookup: Record<number, { qty: number; weight_kg: number }> = {
      500: { qty: 3, weight_kg: 5 }, 600: { qty: 3, weight_kg: 5 }, 601: { qty: 3, weight_kg: 5 }, 501: { qty: 1, weight_kg: 2 },
    }
    const tx: any = {
      work_order_mark: { findMany: jest.fn().mockResolvedValue([{ bom_assembly_id: 100, qty_planned: 2 }]) },
      bom_assembly_part: {
        findMany: jest.fn().mockResolvedValue([{ id: 500, qty: 3, part: { weight_kg: 5 } }]), // bap.qty 3 per assembly × 2 marks = 6 pcs, × 5kg/pc = 30kg
        findUniqueOrThrow: jest.fn().mockImplementation(({ where }: any) => {
          const p = bomAssemblyPartLookup[where.id]
          return Promise.resolve({ assembly_id: 1, qty: p.qty })
        }),
      },
      mo_assembly_line: { findUnique: jest.fn().mockResolvedValue({ qty: 999 }) },
      work_order_part: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.work_order_id !== undefined ? [] : []), // no existing-on-this-WO, no committed-elsewhere, by default
        ),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    }
    return tx
  }

  it("creates a new work_order_part row: qty = bom_assembly_part.qty × the mark's qty_planned, weight_kg derived from it", async () => {
    const tx = makePartsTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeParts(tx, 1, 900, 'tester')

    expect(tx.work_order_part.create).toHaveBeenCalledTimes(1)
    const createdData = tx.work_order_part.create.mock.calls[0][0].data
    expect(createdData).toEqual(expect.objectContaining({ work_order_id: 900, bom_assembly_part_id: 500, created_by: 'tester' }))
    expect(Number(createdData.qty)).toBe(6) // bap.qty 3 × qty_planned 2
    expect(Number(createdData.weight_kg)).toBe(30) // 6 pcs × 5kg/pc
  })

  it('never updates an existing work_order_part row — no persisted plan to refresh, qty is the user\'s from the moment it exists', async () => {
    const tx = makePartsTx({
      work_order_part: {
        findMany: jest.fn().mockResolvedValue([{ bom_assembly_part_id: 500 }]),
        create: jest.fn(),
        update: jest.fn(),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeParts(tx, 1, 900, 'tester')

    expect(tx.work_order_part.create).not.toHaveBeenCalled()
    expect(tx.work_order_part.update).not.toHaveBeenCalled()
  })

  it('treats the same part_id appearing via two different marks as two DISTINCT rows (bom_assembly_part_id is already mark-specific) — no merging', async () => {
    const tx = makePartsTx({
      work_order_mark: {
        findMany: jest.fn().mockResolvedValue([
          { bom_assembly_id: 100, qty_planned: 2 },
          { bom_assembly_id: 200, qty_planned: 1 },
        ]),
      },
      bom_assembly_part: {
        // Different bom_assembly_part rows (600 vs 601) even though they'd
        // represent "the same physical part type" — each assembly gets its
        // own bom_assembly_part row (schema: @@unique([assembly_id, part_id])).
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.assembly_id === 100 ? [{ id: 600, qty: 3, part: { weight_kg: 5 } }] : [{ id: 601, qty: 3, part: { weight_kg: 5 } }]),
        ),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ assembly_id: 1, qty: 3 }),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeParts(tx, 1, 900, 'tester')

    expect(tx.work_order_part.create).toHaveBeenCalledTimes(2) // two separate rows, not merged
    const ids = tx.work_order_part.create.mock.calls.map((c: any) => c[0].data.bom_assembly_part_id)
    expect(ids.sort()).toEqual([600, 601])
  })

  it('skips a part whose row already exists, but still creates a different NEW part on the same mark', async () => {
    const tx = makePartsTx({
      bom_assembly_part: {
        findMany: jest.fn().mockResolvedValue([{ id: 500, qty: 3, part: { weight_kg: 5 } }, { id: 501, qty: 1, part: { weight_kg: 2 } }]),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where }: any) => {
          const map: Record<number, any> = { 500: { qty: 3 }, 501: { qty: 1 } }
          return Promise.resolve({ assembly_id: 1, qty: map[where.id].qty })
        }),
      },
      work_order_part: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.work_order_id !== undefined ? [{ bom_assembly_part_id: 500 }] : []), // 500 already exists ON THIS WO; nothing committed elsewhere
        ),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeParts(tx, 1, 900, 'tester')

    expect(tx.work_order_part.create).toHaveBeenCalledTimes(1)
    expect(tx.work_order_part.create.mock.calls[0][0].data.bom_assembly_part_id).toBe(501)
  })

  it("2026-09-18: caps the suggested qty at what's left of the mark's real total (mo_assembly_line.qty-based, in pieces), not the naive per-WO-qty math, when another WO of the same MO already committed some", async () => {
    // MO's real total for this part, in pieces: bap.qty 3 × mo_line.qty 4 = 12.
    // Another WO already committed 10 of it → only 2 left, even though this
    // WO's own naive calc (bap.qty 3 × qty_planned 2 = 6) would suggest more.
    const tx = makePartsTx({
      mo_assembly_line: { findUnique: jest.fn().mockResolvedValue({ qty: 4 }) },
      work_order_part: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.work_order_id !== undefined ? [] : [{ qty: 10 }]), // nothing on THIS WO yet; 10 pcs already committed on another WO of the same MO
        ),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    })
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeParts(tx, 1, 900, 'tester')

    const createdData = tx.work_order_part.create.mock.calls[0][0].data
    expect(Number(createdData.qty)).toBe(2) // capped, not the naive 6
    expect(Number(createdData.weight_kg)).toBe(10) // 2 pcs × 5kg/pc, derived from the capped qty
  })

  it('2026-09-18: suggests the full naive amount when nothing else has been committed and the MO line qty covers it', async () => {
    const tx = makePartsTx({ mo_assembly_line: { findUnique: jest.fn().mockResolvedValue({ qty: 2 }) } }) // exactly covers this WO's own qty_planned of 2
    const svc = new WorkOrderAutoCreateService()

    await svc.recomputeParts(tx, 1, 900, 'tester')

    const createdData = tx.work_order_part.create.mock.calls[0][0].data
    expect(Number(createdData.qty)).toBe(6) // bap.qty 3 × qty_planned 2, uncapped (total = 3×2 = 6 too)
    expect(Number(createdData.weight_kg)).toBe(30) // 6 pcs × 5kg/pc
  })
})

describe('WorkOrderAutoCreateService.computePartBudget', () => {
  function makeBudgetTx(overrides: Record<string, unknown> = {}) {
    const tx: any = {
      bom_assembly_part: { findUniqueOrThrow: jest.fn().mockResolvedValue({ assembly_id: 1, qty: 3 }) },
      mo_assembly_line: { findUnique: jest.fn().mockResolvedValue({ qty: 4 }) }, // total = 3 × 4 = 12 pcs
      work_order_part: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    }
    return tx
  }

  it('total/committed/remaining: with nothing committed, remaining equals the full total', async () => {
    const tx = makeBudgetTx()
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computePartBudget(tx, 1, 500)

    expect(result).toEqual({ total: 12, committed: 0, remaining: 12 })
  })

  it('sums committed across multiple other WOs of the SAME mo_id', async () => {
    const tx = makeBudgetTx({ work_order_part: { findMany: jest.fn().mockResolvedValue([{ qty: 5 }, { qty: 2 }]) } })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computePartBudget(tx, 1, 500)

    expect(result).toEqual({ total: 12, committed: 7, remaining: 5 })
  })

  it('scopes the committed-sum query to this mo_id — never sums a different MO\'s own allocation of the same shared mark', async () => {
    const tx = makeBudgetTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.computePartBudget(tx, 42, 500)

    expect(tx.work_order_part.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ bom_assembly_part_id: 500, work_order: { mo_id: 42 } }) }),
    )
    expect(tx.mo_assembly_line.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mo_id_bom_assembly_id: { mo_id: 42, bom_assembly_id: 1 } } }),
    )
  })

  it('excludes the given work_order_id from the committed sum (for re-checking a row being replaced, not added to)', async () => {
    const tx = makeBudgetTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.computePartBudget(tx, 1, 500, 900)

    expect(tx.work_order_part.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ work_order_id: { not: 900 } }) }),
    )
  })

  it('remaining never goes negative even if committed somehow exceeds total (floors at 0)', async () => {
    const tx = makeBudgetTx({ work_order_part: { findMany: jest.fn().mockResolvedValue([{ qty: 999 }]) } })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computePartBudget(tx, 1, 500)

    expect(result.remaining).toBe(0)
  })

  it('total is 0 when this MO has no mo_assembly_line allocation for the mark at all', async () => {
    const tx = makeBudgetTx({ mo_assembly_line: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computePartBudget(tx, 1, 500)

    expect(result).toEqual({ total: 0, committed: 0, remaining: 0 })
  })
})

// 2026-09-23 bug fix — user: "DBN-B1-CTR2 มี 1 qty ทำไมถึงสร้างเกินจำนวนใน mo
// ได้". Parallel to computePartBudget above, but note the key difference:
// scoped to (mo_id, operation_id), not just mo_id — a mark legitimately gets
// its own work_order_mark row on EVERY operation it passes through (that's
// normal routing flow), so only sibling WOs of the SAME operation should
// count against the budget, unlike a part's one-time physical withdrawal
// (summed mo-wide regardless of which operation records it).
describe('WorkOrderAutoCreateService.computeMarkBudget', () => {
  function makeMarkBudgetTx(overrides: Record<string, unknown> = {}) {
    const tx: any = {
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    }
    return tx
  }

  it('total/committed/remaining: with nothing committed, remaining equals the full total (the caller-supplied mo_assembly_line.qty)', async () => {
    const tx = makeMarkBudgetTx()
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computeMarkBudget(tx, 1, 10, 100, 1)

    expect(result).toEqual({ total: 1, committed: 0, remaining: 1 })
  })

  it('sums committed across multiple sibling WOs of the SAME operation', async () => {
    const tx = makeMarkBudgetTx({ work_order_mark: { findMany: jest.fn().mockResolvedValue([{ qty_planned: 2 }, { qty_planned: 1 }]) } })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computeMarkBudget(tx, 1, 10, 100, 5)

    expect(result).toEqual({ total: 5, committed: 3, remaining: 2 })
  })

  it('scopes the committed-sum query to (mo_id, operationId) — a mark on a DIFFERENT operation of the same MO must not count against this budget', async () => {
    const tx = makeMarkBudgetTx()
    const svc = new WorkOrderAutoCreateService()

    await svc.computeMarkBudget(tx, 1, 10, 100, 1)

    expect(tx.work_order_mark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bom_assembly_id: 100, removed_at: null, work_order: { mo_id: 1, source_routing_op_id: 10 } }),
      }),
    )
  })

  it('remaining never goes negative even if committed somehow exceeds total (floors at 0)', async () => {
    const tx = makeMarkBudgetTx({ work_order_mark: { findMany: jest.fn().mockResolvedValue([{ qty_planned: 99 }]) } })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computeMarkBudget(tx, 1, 10, 100, 1)

    expect(result.remaining).toBe(0)
  })

  it('ignores removed marks — a soft-removed work_order_mark row on a sibling WO frees its budget back up', async () => {
    // removed_at: null in the query means Prisma itself filters these out
    // server-side; the mock here stands in for that already-filtered result.
    const tx = makeMarkBudgetTx({ work_order_mark: { findMany: jest.fn().mockResolvedValue([]) } })
    const svc = new WorkOrderAutoCreateService()

    const result = await svc.computeMarkBudget(tx, 1, 10, 100, 1)

    expect(result).toEqual({ total: 1, committed: 0, remaining: 1 })
  })
})
