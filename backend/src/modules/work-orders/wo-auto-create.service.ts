import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { computeActivityDurationRaw } from './activity-duration.util'
import { evalFormulaExpr } from './consume-formula.util'

/**
 * T-WO.03 · Manual WO creation (multi-mark redesign, 2026-09-17;
 * multi-WO-per-operation, 2026-09-23; marks fixed at creation, 2026-09-23).
 *
 * Replaces the old `createForMo()` (auto-created 1 WO per routing-op × mo_assembly_line
 * the instant an MO was confirmed — deleted here, no longer called by anything). WO
 * creation is now a fully manual, explicit action: a factory admin picks ONE routing
 * operation + one-or-more assembly lines and calls `createOrAddMarks()` (via
 * `POST /mo/:id/work-orders`), which ALWAYS creates a brand-new WO — there is no way to
 * add marks to an already-created WO ("สร้าง wo แล้วไม่ควรเพิ่ม mark ทีหลังได้" — once a
 * WO is created, you should not be able to add marks to it later). A WO's mark set is
 * fixed at creation, same as its team/plan dates (see WorkOrdersController — no `PATCH
 * /wo/:id` either). Need more marks for the same operation? Create ANOTHER WO for it
 * (multi-WO-per-operation) — a mark may deliberately end up on more than one of an
 * operation's WOs (no cross-WO exclusivity), just never added to one after the fact.
 *
 * A `work_order` spans MANY marks via `work_order_mark` (junction table) — see
 * schema.prisma header comment on both models for the full redesign rationale. It is
 * NOT unique per (mo_id, source_routing_op_id) (dropped 2026-09-23) — an operation can be
 * split across several WOs, e.g. different teams/subcontractors working it in parallel.
 */
@Injectable()
export class WorkOrderAutoCreateService {
  constructor() {}

  /**
   * Creates a NEW work_order for (moId, operationId) and adds a `work_order_mark` row
   * for each of `marks` — always creates fresh, never finds/reuses an existing WO for
   * this (mo, operation) pair, and there is no later "add more marks" path (2026-09-23
   * — see this file's header comment). Recomputes the WO's
   * `expected_duration_min`/`setup_time_min` afterwards — see `recomputeDuration()`.
   */
  async createOrAddMarks(
    tx: Prisma.TransactionClient,
    moId: number,
    operationId: number,
    marks: { assembly_line_id: number; qty: number }[],
    userName: string,
    assignedTo?: string,
    planStart?: Date,
    planFinish?: Date,
    teamId?: number,
  ): Promise<{ work_order_id: number; wo_code: string; marks_added: number }> {
    const mo = await tx.manufacturing_order.findUnique({
      where: { id: moId },
      select: { id: true, routing_template_id: true },
    })
    if (!mo) throw new NotFoundException(`MO ${moId} not found`)

    const op = await this.loadOperation(tx, operationId)
    if (!op) throw new NotFoundException(`Routing operation ${operationId} not found`)
    if (op.template_id !== mo.routing_template_id) {
      throw new BadRequestException(
        `Routing operation ${operationId} does not belong to MO ${moId}'s bound routing template`,
      )
    }

    const qtyByLineId = new Map(marks.map((m) => [m.assembly_line_id, m.qty]))
    const uniqueLineIds = [...qtyByLineId.keys()]
    const lines = await tx.mo_assembly_line.findMany({
      where: { id: { in: uniqueLineIds }, mo_id: moId },
      include: { bom_assembly: { select: { id: true, dispatch_id: true } } },
    })
    const foundLineIds = new Set(lines.map((l) => l.id))
    const missing = uniqueLineIds.filter((id) => !foundLineIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(`Assembly line(s) not found on MO ${moId}: ${missing.join(', ')}`)
    }
    // qty is user-specified per mark (2026-09-17) — capped at what's actually
    // left to plan for THIS operation (see assertMarkBudgets()/
    // computeMarkBudget() above): the mark's own mo_assembly_line.qty MINUS
    // whatever's already qty_planned on sibling WOs of this same operation.
    await this.assertMarkBudgets(tx, moId, operationId, lines, qtyByLineId)

    const resolvedActs = this.resolveActivities(op)

    // wo_code allocation (SELECT FOR UPDATE) and work_center_id/op_attributes
    // derivation — same as the old createForMo() used, just for one operation
    // instead of every op on the template at once.
    const seq = await tx.$queryRaw<{ next_val: number }[]>`
      SELECT next_val FROM work_order_code_seq WHERE id = 1 FOR UPDATE
    `
    const code = seq[0].next_val
    await tx.$executeRaw`UPDATE work_order_code_seq SET next_val = ${code + 1} WHERE id = 1`
    const wo_code = `WO-${code.toString().padStart(8, '0')}`

    const wo = await tx.work_order.create({
      data: {
        wo_code,
        mo_id: moId,
        source_routing_op_id: op.id,
        sequence: op.sequence,
        work_center_id: op.workcenter_id,
        // Placeholder — recomputeDuration() below sets the real, mark-aware totals
        // before this transaction commits, so these values never actually surface.
        expected_duration_min: 1,
        setup_time_min: 0,
        op_attributes: { activities: resolvedActs },
        status: 'NOT_STARTED',
        // Free-text fallback (2026-09-21), kept for API completeness — the
        // Create WO form itself now uses the structured `team` picker below
        // (2026-09-22, once the Team CRUD existed to back a real dropdown).
        assigned_to: assignedTo ?? null,
        subcontractor_id: teamId ?? null,
        plan_start: planStart ?? null,
        plan_finish: planFinish ?? null,
        created_by: userName,
      },
    })

    for (const line of lines) {
      await tx.work_order_mark.create({
        data: {
          work_order_id: wo.id,
          bom_assembly_id: line.bom_assembly_id,
          bom_dispatch_id_snapshot: line.bom_assembly.dispatch_id,
          qty_planned: qtyByLineId.get(line.id)!,
          created_by: userName,
        },
      })
    }

    await this.recomputeDuration(tx, wo.id)
    await this.recomputeConsume(tx, wo.id, userName)
    await this.recomputeParts(tx, moId, wo.id, userName)

    return {
      work_order_id: wo.id,
      wo_code: wo.wo_code,
      marks_added: lines.length,
    }
  }

  /**
   * Recomputes and persists `expected_duration_min`/`setup_time_min` for one WO, summed
   * across ALL of its current non-removed `work_order_mark` rows — called after any
   * mutation that changes that set or its qty_planned (add-marks above; remove-mark and
   * per-mark accept-new-version in WorkOrdersService). Deliberately not `private`.
   *
   * Formula (multi-mark redesign "Plan time" rule): setup counted ONCE per WO (it's a
   * property of the operation, not of any one mark or how many pieces it produces); run
   * = Σ over non-removed marks of (per-piece run for the WO's operation, computed against
   * THAT mark's own bom_assembly dimensions × that mark's qty_planned) — rounded/clamped
   * ONCE at the end, not per-mark (per-mark-then-sum would compound rounding error and,
   * worse, the old min-1-minute floor per mark would overcount a WO with many marks).
   * This is also a bug fix: the pre-redesign single-mark math never multiplied by qty at
   * all for some paths.
   *
   * Reads the operation's activities from the WO's OWN frozen `op_attributes.activities`
   * snapshot (set once, at creation, above) rather than re-deriving from the live routing
   * template — same "stable once created" contract `WorkOrdersService.findOne()` already
   * established for `source_routing_op`. A routing-template edit after WO creation must
   * not silently change an existing WO's duration just because a mark was later added or
   * removed.
   */
  async recomputeDuration(
    tx: Prisma.TransactionClient,
    workOrderId: number,
  ): Promise<{ expected_duration_min: number; setup_time_min: number }> {
    const wo = await tx.work_order.findUnique({
      where: { id: workOrderId },
      select: { op_attributes: true },
    })
    if (!wo) throw new NotFoundException(`WO ${workOrderId} not found`)

    const acts: { name: string; source_activity_id: number | null }[] = Array.isArray((wo.op_attributes as any)?.activities)
      ? (wo.op_attributes as any).activities
      : []

    const sourceIds = new Set<number>()
    for (const a of acts) {
      if (a.source_activity_id) sourceIds.add(a.source_activity_id)
    }

    type ActData = { formula_code: string | null; per_minute: unknown; duration_min: unknown; kind: string }
    const activityMap = new Map<number, ActData>()
    if (sourceIds.size > 0) {
      const rows = await tx.activity.findMany({
        where: { id: { in: [...sourceIds] } },
        select: { id: true, formula_code: true, per_minute: true, duration_min: true, kind: true },
      })
      for (const r of rows) activityMap.set(r.id, r)
    }

    const marks = await tx.work_order_mark.findMany({
      where: { work_order_id: workOrderId, removed_at: null },
      select: {
        qty_planned: true,
        bom_assembly: { select: { length_mm: true, surface_area_m2: true, width_mm: true } },
      },
    })

    let totalRun = 0
    let setupMin = 0
    for (const m of marks) {
      const raw = computeActivityDurationRaw(acts, m.bom_assembly, activityMap)
      totalRun += raw.run_min * Number(m.qty_planned)
      setupMin = raw.setup_min // fixed per-operation cost, independent of bom dims — same every mark, counted once
    }

    const expected_duration_min = Math.max(1, Math.round(totalRun))
    const setup_time_min = Math.max(0, Math.round(setupMin))

    await tx.work_order.update({
      where: { id: workOrderId },
      data: { expected_duration_min, setup_time_min },
    })

    return { expected_duration_min, setup_time_min }
  }

  /**
   * Plan-vs-actual material consumption (2026-09-17), parallel to
   * `recomputeDuration()` above — same "sum the live formula calc across all of
   * the WO's non-removed marks" shape, but persisted per material instead of
   * folded into one WO-level number. Called after any mutation that changes a
   * WO's mark set (create/add-marks; also fits remove-mark/accept-new-version
   * later if needed, matching recomputeDuration's call sites).
   *
   * `qty_planned` is always refreshed to the current calculation. `qty_actual`
   * is refreshed to match ONLY when a `work_order_consume` row doesn't exist
   * yet (first time this material shows up on this WO) — once a row exists,
   * `qty_actual` is left untouched here (it's user-owned from that point on;
   * see `updateConsumeActuals()` in WorkOrdersService), so re-running this
   * after adding more marks never silently overwrites an already-recorded
   * actual withdrawal. Materials that drop out of the plan entirely (e.g.
   * after a mark is removed) keep their existing row untouched rather than
   * being deleted — the actual may already reflect real material pulled.
   */
  async recomputeConsume(tx: Prisma.TransactionClient, workOrderId: number, userName: string): Promise<void> {
    const wo = await tx.work_order.findUnique({ where: { id: workOrderId }, select: { op_attributes: true } })
    if (!wo) throw new NotFoundException(`WO ${workOrderId} not found`)

    const acts: { source_activity_id: number | null }[] = Array.isArray((wo.op_attributes as any)?.activities)
      ? (wo.op_attributes as any).activities
      : []
    const sourceIds = [...new Set(acts.map((a) => a.source_activity_id).filter((id): id is number => !!id))]

    const consumeRows = sourceIds.length > 0
      ? await tx.activity_consume.findMany({
          where: { activity_id: { in: sourceIds } },
          include: {
            material: { select: { id: true } },
            formula: { select: { expr: true, result_unit: true } },
          },
        })
      : []
    const consumeByActivity = new Map<number, typeof consumeRows>()
    for (const row of consumeRows) {
      const list = consumeByActivity.get(row.activity_id) ?? []
      list.push(row)
      consumeByActivity.set(row.activity_id, list)
    }

    const marks = await tx.work_order_mark.findMany({
      where: { work_order_id: workOrderId, removed_at: null },
      select: {
        qty_planned: true,
        bom_assembly: { select: { length_mm: true, surface_area_m2: true, weight_kg: true } },
      },
    })

    const totals = new Map<number, { qty: number; unit: string | null }>()
    for (const mark of marks) {
      const ba = mark.bom_assembly
      const vars = {
        length: ba.length_mm ? Number(ba.length_mm) / 1000 : 0,
        area: ba.surface_area_m2 ? Number(ba.surface_area_m2) : 0,
        weight: ba.weight_kg ? Number(ba.weight_kg) : 0,
        thickness: 0,
      }
      const qtyPlanned = Number(mark.qty_planned)
      for (const act of acts) {
        if (!act.source_activity_id) continue
        for (const c of consumeByActivity.get(act.source_activity_id) ?? []) {
          const perUnitQty = c.formula?.expr ? (() => { try { return evalFormulaExpr(c.formula!.expr, vars) } catch { return 0 } })() : 0
          const qty = perUnitQty * qtyPlanned
          if (!(qty > 0)) continue
          const existing = totals.get(c.material.id)
          totals.set(c.material.id, { qty: (existing?.qty ?? 0) + qty, unit: c.formula?.result_unit ?? null })
        }
      }
    }

    const existingRows = await tx.work_order_consume.findMany({
      where: { work_order_id: workOrderId },
      select: { material_id: true },
    })
    const existingMaterialIds = new Set(existingRows.map((r) => r.material_id))

    for (const [materialId, { qty, unit }] of totals) {
      // Whole units only (2026-09-21) — shop floor records consume to the
      // nearest whole unit, not fractional kg/pcs.
      const qty_planned = Math.round(qty)
      if (existingMaterialIds.has(materialId)) {
        await tx.work_order_consume.update({
          where: { work_order_id_material_id: { work_order_id: workOrderId, material_id: materialId } },
          data: { qty_planned, unit, updated_by: userName },
        })
      } else {
        await tx.work_order_consume.create({
          data: {
            work_order_id: workOrderId,
            material_id: materialId,
            qty_planned,
            qty_actual: qty_planned, // default = plan; user-editable afterwards, uncapped
            unit,
            created_by: userName,
          },
        })
      }
    }
  }

  /**
   * The real cap for a part's withdrawal weight (2026-09-18) — per user:
   * every operation touching a mark may enter a withdrawal for the same
   * part (real shop-floor practice for WHICH operation actually pulls the
   * material isn't fixed/predictable), but the SUM across all of them must
   * never exceed the part's true total need — unlike work_order_consume,
   * where going over the plan is expected and allowed.
   *
   * Scoped to ONE MO deliberately: the same physical mark can be split
   * across SEVERAL different MOs (each with its own `mo_assembly_line`
   * allocation, P13) — `bom_assembly_part` is keyed by the mark, not by MO,
   * so naively summing every `work_order_part` row for a `bom_assembly_part
   * _id` would double-count against a completely different MO's own
   * allocation of the same mark. `total` uses THIS MO's own
   * `mo_assembly_line.qty` (its allocated qty for the mark, not the mark's
   * grand total across every MO it's split into), and `committed` only sums
   * rows whose `work_order.mo_id` matches.
   */
  async computePartBudget(
    client: Prisma.TransactionClient,
    moId: number,
    bomAssemblyPartId: number,
    excludeWorkOrderId?: number,
  ): Promise<{ total: number; committed: number; remaining: number }> {
    const bap = await client.bom_assembly_part.findUniqueOrThrow({
      where: { id: bomAssemblyPartId },
      select: { assembly_id: true, qty: true },
    })
    const line = await client.mo_assembly_line.findUnique({
      where: { mo_id_bom_assembly_id: { mo_id: moId, bom_assembly_id: bap.assembly_id } },
      select: { qty: true },
    })
    // Pieces, not kg (2026-09-21) — bap.qty is already a per-one-assembly
    // rate (confirmed against the pre-existing getParts() aggregation, which
    // multiplies the same two fields with no further division by the mark's
    // BOM-wide bom_assembly.qty), so `line.qty` alone correctly scales this
    // MO's own share — no separate ratio-against-the-BOM-total step needed.
    const total = line ? Number(bap.qty) * Number(line.qty) : 0

    const others = await client.work_order_part.findMany({
      where: {
        bom_assembly_part_id: bomAssemblyPartId,
        work_order: { mo_id: moId },
        ...(excludeWorkOrderId ? { work_order_id: { not: excludeWorkOrderId } } : {}),
      },
      select: { qty: true },
    })
    const committed = others.reduce((sum, o) => sum + Number(o.qty), 0)

    return { total, committed, remaining: Math.max(0, total - committed) }
  }

  /**
   * Sibling-WO-of-the-same-operation budget for one mark (2026-09-23 bug fix —
   * user: "DBN-B1-CTR2 มี 1 qty ทำไมถึงสร้างเกินจำนวนใน mo ได้"). Parallel to
   * `computePartBudget()` above, but scoped ONE LEVEL TIGHTER: `total` here is
   * the caller's own already-fetched `mo_assembly_line.qty` (both call sites —
   * `createOrAddMarks()`/`previewMarksImpact()` — already have it from their
   * own mo_id-scoped `mo_assembly_line.findMany()`, so there's no need to
   * re-derive it with an extra query the way `computePartBudget()` does for
   * `bom_assembly_part`). The budget itself is scoped to `(mo_id, operationId)`,
   * NOT just `mo_id` like parts: a mark legitimately gets its OWN
   * `work_order_mark` row on EVERY operation it passes through (fit-up, then
   * weld, then paint, ...) — that's normal routing flow, not over-commitment —
   * whereas a part's physical withdrawal is a one-time consumption regardless
   * of which operation happens to record it. What must never be exceeded is
   * the SUM of `qty_planned` across sibling WOs of the SAME operation (the
   * 2026-09-23 multi-WO-per-operation feature deliberately allows a mark to
   * sit on more than one of an operation's WOs — e.g. split across teams —
   * but not to be double-planned beyond the MO's real qty for it). No
   * `excludeWorkOrderId` (unlike `computePartBudget()`) — every WO this
   * budget is checked against is a brand-new one being created (2026-09-23:
   * a WO's marks are fixed at creation, nothing ever recomputes its own
   * budget excluding itself the way part-actuals edits do).
   */
  async computeMarkBudget(
    client: Prisma.TransactionClient,
    moId: number,
    operationId: number,
    bomAssemblyId: number,
    total: number,
  ): Promise<{ total: number; committed: number; remaining: number }> {
    const others = await client.work_order_mark.findMany({
      where: {
        bom_assembly_id: bomAssemblyId,
        removed_at: null,
        work_order: { mo_id: moId, source_routing_op_id: operationId },
      },
      select: { qty_planned: true },
    })
    const committed = others.reduce((sum, o) => sum + Number(o.qty_planned), 0)

    return { total, committed, remaining: Math.max(0, total - committed) }
  }

  /**
   * Shared by `createOrAddMarks()` and `previewMarksImpact()` so a preview
   * rejects exactly the same selections the real create would (2026-09-23).
   * Supersedes the old "qty > mo_assembly_line.qty" cap — that check is the
   * special case of this one where nothing's committed on a sibling WO yet
   * (committed=0 → remaining=total), so no caller loses coverage.
   */
  private async assertMarkBudgets(
    client: Prisma.TransactionClient,
    moId: number,
    operationId: number,
    lines: { id: number; bom_assembly_id: number; qty: unknown }[],
    qtyByLineId: Map<number, number>,
  ): Promise<void> {
    const overBudget: { lineId: number; requested: number; remaining: number }[] = []
    for (const line of lines) {
      const { remaining } = await this.computeMarkBudget(client, moId, operationId, line.bom_assembly_id, Number(line.qty))
      const requested = Number(qtyByLineId.get(line.id))
      if (requested > remaining) overBudget.push({ lineId: line.id, requested, remaining })
    }
    if (overBudget.length > 0) {
      throw new BadRequestException(
        `Requested qty exceeds what's left to plan for this operation (already committed to a sibling work order of the same operation): ${overBudget
          .map((o) => `line ${o.lineId} (requested ${o.requested}, ${o.remaining} remaining)`)
          .join(', ')}`,
      )
    }
  }

  /**
   * Physical part withdrawal (2026-09-17, qty-primary 2026-09-21), parallel
   * to `recomputeConsume()` but for `bom_assembly_part` rows instead of
   * `activity_consume` — and deliberately simpler: NO plan/actual split.
   * `qty` (pieces) is computed once, purely as a starting suggestion
   * (bom_assembly_part.qty × the mark's own qty_planned), CAPPED at whatever's
   * left of the mark's real total after other WOs of the same MO already
   * claimed some (2026-09-18 — see `computePartBudget()`); `weight_kg` is
   * then derived from that qty purely for display/reporting. A
   * `bom_assembly_part_id` is already mark-specific (its `assembly_id` scopes
   * to one bom_assembly), so there's no cross-mark summing to do here (unlike
   * recomputeConsume's materials,
   * which genuinely can be shared). Only CREATES missing rows — never updates
   * an existing one, since there's no persisted plan to refresh it from; once
   * a row exists its qty is entirely the user's (see updatePartActuals, which
   * enforces the same budget on edits).
   */
  async recomputeParts(tx: Prisma.TransactionClient, moId: number, workOrderId: number, userName: string): Promise<void> {
    const marks = await tx.work_order_mark.findMany({
      where: { work_order_id: workOrderId, removed_at: null },
      select: { bom_assembly_id: true, qty_planned: true },
    })

    const existingRows = await tx.work_order_part.findMany({
      where: { work_order_id: workOrderId },
      select: { bom_assembly_part_id: true },
    })
    const existingPartIds = new Set(existingRows.map((r) => r.bom_assembly_part_id))

    for (const mark of marks) {
      const parts = await tx.bom_assembly_part.findMany({
        where: { assembly_id: mark.bom_assembly_id },
        select: { id: true, qty: true, part: { select: { weight_kg: true } } },
      })
      for (const p of parts) {
        if (existingPartIds.has(p.id)) continue
        const naiveQty = Number(p.qty) * Number(mark.qty_planned)
        const { remaining } = await this.computePartBudget(tx, moId, p.id)
        const qty = Math.min(naiveQty, remaining)
        const weight = qty * Number(p.part.weight_kg ?? 0)
        await tx.work_order_part.create({
          data: {
            work_order_id: workOrderId,
            bom_assembly_part_id: p.id,
            qty: new Prisma.Decimal(Math.round(qty * 1000) / 1000),
            weight_kg: new Prisma.Decimal(Math.round(weight * 1000) / 1000),
            created_by: userName,
          },
        })
      }
    }
  }

  /**
   * Read-only preview (2026-09-17) — computes what `createOrAddMarks()` +
   * `recomputeParts()`/`recomputeConsume()` WOULD produce for a candidate
   * (operation, marks+qty) selection, WITHOUT creating/updating anything.
   * Powers the single-page Create Work Order form: the user sees Parts +
   * Consume for their current picks and can Create only once, with
   * everything (marks, part weights, consume actuals) submitted together —
   * see [[project_multi_mark_wo_design]] follow-up notes for why this
   * replaced the earlier "create first, then review" 2-step flow. Same
   * validation as `createOrAddMarks()` (operation must belong to the MO's
   * routing template; assembly lines must belong to the MO; qty capped at
   * what's left of each mark's `mo_assembly_line.qty` after sibling WOs of
   * this operation, via `assertMarkBudgets()` — 2026-09-23) — a preview of an
   * invalid selection should fail exactly the same way the real create would.
   */
  async previewMarksImpact(
    client: Prisma.TransactionClient,
    moId: number,
    operationId: number,
    marks: { assembly_line_id: number; qty: number }[],
  ): Promise<{
    parts: { bom_assembly_part_id: number; assembly_mark: string; part_mark: string; profile: string | null; grade: string | null; qty: number; max_qty: number; unit_weight_kg: number; weight_kg: number }[]
    consume: { material_id: number; code: string; name: string; qty: number | null; unit: string | null }[]
    // What createOrAddMarks() + recomputeDuration() would set the new WO's
    // own duration fields to for this exact (operation, marks) selection —
    // powers the Create WO form's auto-computed Plan Finish (2026-09-23:
    // "plan finish user ไม่ต้องกรอกเองตอนสร้าง wo เพราะระบบจะคำนวณให้จาก
    // routing ที่มี plan duration" — it was a free-entry field, the user
    // wants it derived from Plan Start + this instead).
    expected_duration_min: number
    setup_time_min: number
  }> {
    const mo = await client.manufacturing_order.findUnique({
      where: { id: moId },
      select: { id: true, routing_template_id: true },
    })
    if (!mo) throw new NotFoundException(`MO ${moId} not found`)

    const op = await this.loadOperation(client, operationId)
    if (!op) throw new NotFoundException(`Routing operation ${operationId} not found`)
    if (op.template_id !== mo.routing_template_id) {
      throw new BadRequestException(
        `Routing operation ${operationId} does not belong to MO ${moId}'s bound routing template`,
      )
    }

    const qtyByLineId = new Map(marks.map((m) => [m.assembly_line_id, m.qty]))
    const uniqueLineIds = [...qtyByLineId.keys()]
    const lines = await client.mo_assembly_line.findMany({
      where: { id: { in: uniqueLineIds }, mo_id: moId },
      include: { bom_assembly: { select: { id: true, assembly_mark: true, length_mm: true, surface_area_m2: true, width_mm: true, weight_kg: true } } },
    })
    const foundLineIds = new Set(lines.map((l) => l.id))
    const missing = uniqueLineIds.filter((id) => !foundLineIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(`Assembly line(s) not found on MO ${moId}: ${missing.join(', ')}`)
    }
    await this.assertMarkBudgets(client, moId, operationId, lines, qtyByLineId)

    // Parts — one row per (mark, bom_assembly_part), never merged (each is
    // already mark-specific), same math as recomputeParts() — including the
    // same real-total budget cap (2026-09-18): the suggestion never exceeds
    // whatever's left after other WOs of this MO already claimed some.
    const parts: { bom_assembly_part_id: number; assembly_mark: string; part_mark: string; profile: string | null; grade: string | null; qty: number; max_qty: number; unit_weight_kg: number; weight_kg: number }[] = []
    for (const line of lines) {
      const qty = Number(qtyByLineId.get(line.id))
      const bomParts = await client.bom_assembly_part.findMany({
        where: { assembly_id: line.bom_assembly_id },
        select: { id: true, qty: true, part: { select: { part_mark: true, profile: true, grade: true, weight_kg: true } } },
      })
      for (const bp of bomParts) {
        const naiveQty = Number(bp.qty) * qty
        const { total, committed } = await this.computePartBudget(client, moId, bp.id)
        const maxQty = Math.max(0, total - committed)
        const suggestedQty = Math.round(Math.min(naiveQty, maxQty) * 1000) / 1000
        const unitWeight = Number(bp.part.weight_kg ?? 0)
        parts.push({
          bom_assembly_part_id: bp.id,
          assembly_mark: line.bom_assembly.assembly_mark,
          part_mark: bp.part.part_mark,
          profile: bp.part.profile,
          grade: bp.part.grade,
          qty: suggestedQty,
          max_qty: Math.round(maxQty * 1000) / 1000,
          unit_weight_kg: Math.round(unitWeight * 1000) / 1000,
          weight_kg: Math.round(suggestedQty * unitWeight * 1000) / 1000,
        })
      }
    }

    // Consume — same formula-driven math as recomputeConsume(), resolved
    // fresh from the operation template (mirrors what createOrAddMarks()
    // freezes into a brand-new WO's op_attributes — there's no existing WO
    // to read it back from yet during a preview).
    const acts = this.resolveActivities(op)
    const sourceIds = [...new Set(acts.map((a: any) => a.source_activity_id).filter((id: any): id is number => !!id))]
    const consumeRows = sourceIds.length > 0
      ? await client.activity_consume.findMany({
          where: { activity_id: { in: sourceIds } },
          include: {
            material: { select: { id: true, default_code: true, name: true } },
            formula: { select: { expr: true, result_unit: true } },
          },
        })
      : []
    const consumeByActivity = new Map<number, typeof consumeRows>()
    for (const row of consumeRows) {
      const list = consumeByActivity.get(row.activity_id) ?? []
      list.push(row)
      consumeByActivity.set(row.activity_id, list)
    }

    const totals = new Map<number, { code: string; name: string; qty: number; unit: string | null }>()
    // Materials the Activity Library links to this op but with no formula
    // to compute a quantity from (2026-09-22) — previously dropped outright,
    // which made Create WO's Consume list disagree with the MO overview's
    // Routing card (a plain reference list that shows them regardless).
    // Surfaced here with qty: null so the picker shows "no formula" instead
    // of silently looking like the op has no consumables at all.
    const noFormula = new Map<number, { code: string; name: string }>()
    for (const act of acts as any[]) {
      if (!act.source_activity_id) continue
      for (const c of consumeByActivity.get(act.source_activity_id) ?? []) {
        if (!c.formula) noFormula.set(c.material.id, { code: c.material.default_code, name: c.material.name })
      }
    }
    for (const line of lines) {
      const qty = Number(qtyByLineId.get(line.id))
      const ba = line.bom_assembly
      const vars = {
        length: ba.length_mm ? Number(ba.length_mm) / 1000 : 0,
        area: ba.surface_area_m2 ? Number(ba.surface_area_m2) : 0,
        weight: ba.weight_kg ? Number(ba.weight_kg) : 0,
        thickness: 0,
      }
      for (const act of acts as any[]) {
        if (!act.source_activity_id) continue
        for (const c of consumeByActivity.get(act.source_activity_id) ?? []) {
          if (!c.formula) continue
          const perUnitQty = (() => { try { return evalFormulaExpr(c.formula!.expr, vars) } catch { return 0 } })()
          const q = perUnitQty * qty
          if (!(q > 0)) continue
          const existing = totals.get(c.material.id)
          if (existing) existing.qty += q
          else totals.set(c.material.id, { code: c.material.default_code, name: c.material.name, qty: q, unit: c.formula?.result_unit ?? null })
        }
      }
    }
    // Whole units only (2026-09-21) — matches recomputeConsume()'s rounding.
    const consume = [
      ...[...totals.entries()].map(([material_id, v]) => ({ material_id, code: v.code, name: v.name, qty: Math.round(v.qty) as number | null, unit: v.unit })),
      ...[...noFormula.entries()].filter(([id]) => !totals.has(id)).map(([material_id, v]) => ({ material_id, code: v.code, name: v.name, qty: null as number | null, unit: null })),
    ]

    // Duration — same math as recomputeDuration(), resolved fresh the same
    // way Consume above is (no existing WO to read op_attributes back from
    // yet during a preview).
    const activityRows = sourceIds.length > 0
      ? await client.activity.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, formula_code: true, per_minute: true, duration_min: true, kind: true },
        })
      : []
    const activityMap = new Map(activityRows.map((r) => [r.id, r]))
    let totalRun = 0
    let setupMin = 0
    for (const line of lines) {
      const qty = Number(qtyByLineId.get(line.id))
      const raw = computeActivityDurationRaw(acts as any, line.bom_assembly, activityMap)
      totalRun += raw.run_min * qty
      setupMin = raw.setup_min // fixed per-operation cost, independent of bom dims — same every mark, counted once
    }
    const expected_duration_min = Math.max(1, Math.round(totalRun))
    const setup_time_min = Math.max(0, Math.round(setupMin))

    return { parts, consume, expected_duration_min, setup_time_min }
  }

  /** Loads a routing op + enough of its template/activities to resolve `resolveActivities()`. */
  private async loadOperation(tx: Prisma.TransactionClient, operationId: number) {
    return tx.mrp_routing_workcenter.findUnique({
      where: { id: operationId },
      select: {
        id: true,
        template_id: true,
        sequence: true,
        workcenter_id: true,
        activities_snapshot: true,
        operation_template: {
          select: {
            activities: {
              select: {
                id: true,
                name: true,
                measure: true,
                per_minute: true,
                source_activity_id: true,
                tools: { select: { resource_id: true, qty: true } },
                skills: { select: { skill: true, qty: true, level: true } },
              },
            },
          },
        },
      },
    })
  }

  /**
   * Resolves the operation's activities at WO-creation time: prefer live
   * `operation_template.activities` (Operation Library FK), fallback to the routing op's
   * own `activities_snapshot` (RoutingBuilder canvas save). Frozen into the new WO's
   * `op_attributes.activities` — same resolution `createForMo()` always did, just for one
   * op instead of every op on the template at once.
   */
  private resolveActivities(op: Awaited<ReturnType<WorkOrderAutoCreateService['loadOperation']>>) {
    const liveActs = op?.operation_template?.activities ?? []
    return liveActs.length > 0
      ? liveActs.map((a) => ({
          name: a.name,
          measure: a.measure ?? null,
          per_minute: a.per_minute != null ? Number(a.per_minute) : null,
          source_activity_id: a.source_activity_id ?? null,
          tool_ids: a.tools.map((t) => ({ id: t.resource_id, qty: t.qty })),
          labors: a.skills.map((s) => ({ skill: s.skill, qty: s.qty, level: s.level ?? null })),
        }))
      : Array.isArray(op?.activities_snapshot)
      ? (op!.activities_snapshot as any[])
      : []
  }
}
