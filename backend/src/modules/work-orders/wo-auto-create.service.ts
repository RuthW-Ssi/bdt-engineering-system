import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Parser } from 'expr-eval'

/**
 * T-WO.03 · Auto-create Work Orders when an MO becomes CONFIRMED.
 *
 * Called inside the MO confirm transaction from BOTH paths
 * (ManufacturingOrderService.create() with confirm:true AND changeStatus()
 * DRAFT→CONFIRMED). 1 WO per (routing op × mo_assembly_line) — Q1=D.
 *
 * Idempotent: if any WO already exists for the MO, it no-ops (re-confirm safe).
 * Each WO snapshots the operation fields + the assembly's dispatch id at confirm
 * time (bom_dispatch_id_snapshot · soft ref · drives the BOM Version Alert).
 *
 * Duration logic (Phase 1):
 *   If activities_snapshot has entries with formula_code + per_minute,
 *   evaluate each formula against BOM dimensions and sum the durations.
 *   Falls back to time_cycle_manual ?? time_cycle when formula data is absent.
 */
@Injectable()
export class WorkOrderAutoCreateService {
  private readonly parser = new Parser()

  constructor() {}

  /** Returns the number of WOs created (0 if already present). */
  async createForMo(
    tx: Prisma.TransactionClient,
    moId: number,
    userName: string,
  ): Promise<number> {
    const existing = await tx.work_order.count({ where: { mo_id: moId } })
    if (existing > 0) return 0 // idempotent — re-confirm does not duplicate

    const mo = await tx.manufacturing_order.findUnique({
      where: { id: moId },
      select: {
        routing_template: {
          select: {
            operations: {
              orderBy: { sequence: 'asc' },
              select: {
                id: true,
                sequence: true,
                workcenter_id: true,
                time_cycle: true,
                time_cycle_manual: true,
                activities_snapshot: true,
              },
            },
          },
        },
      },
    })
    const ops = mo?.routing_template?.operations ?? []
    const lines = await tx.mo_assembly_line.findMany({
      where: { mo_id: moId },
      include: {
        bom_assembly: {
          select: {
            dispatch_id: true,
            length_mm: true,
            surface_area_m2: true,
            weight_kg: true,
            width_mm: true,
            height_mm: true,
          },
        },
      },
      orderBy: { line_seq: 'asc' },
    })

    // Load formula param expressions once (small table, ~27 rows)
    const formulaRows = await tx.$queryRaw<Array<{ code: string; formula_expression: string }>>`
      SELECT code, formula_expression FROM routing_formula_param
    `
    const formulaMap = new Map(formulaRows.map(r => [r.code, r.formula_expression]))

    const woCount = lines.length * ops.length
    if (woCount === 0) return 0

    // Batch-allocate all WO codes in one SELECT FOR UPDATE + UPDATE round-trip
    // (avoids N×M sequential lock acquisitions that timeout on large MOs)
    const seq = await tx.$queryRaw<{ next_val: number }[]>`
      SELECT next_val FROM work_order_code_seq WHERE id = 1 FOR UPDATE
    `
    const firstCode = seq[0].next_val
    await tx.$executeRaw`
      UPDATE work_order_code_seq SET next_val = ${firstCode + woCount} WHERE id = 1
    `

    let codeIdx = 0
    const woData: Prisma.work_orderCreateManyInput[] = []

    for (const line of lines) {
      const bom = line.bom_assembly
      const dispatchId = bom.dispatch_id

      const vars: Record<string, number> = {
        cut_length_mm:       Number(bom.length_mm      ?? 0),
        weld_length_mm:      Number(bom.length_mm      ?? 0),
        edge_length_mm:      Number(bom.length_mm      ?? 0),
        bevel_length_mm:     Number(bom.length_mm      ?? 0),
        Length:              Number(bom.length_mm      ?? 0),
        Width:               Number(bom.width_mm       ?? 0),
        Hight:               Number(bom.height_mm      ?? 0),
        sumNet_surface_area: Number(bom.surface_area_m2 ?? 0),
        product_area:        Number(bom.surface_area_m2 ?? 0),
        sumWeight:           Number(bom.weight_kg      ?? 0),
        count_part:  1,
        cut_count:   1,
        bend_count:  1,
        hole_count:  1,
        tack_points: 1,
        part:        1,
        pipe_perimeter: Number(bom.width_mm ?? 0),
      }

      for (const op of ops) {
        const expected_duration_min = this.computeDuration(op, vars, formulaMap)
        const wo_code = `WO-${(firstCode + codeIdx).toString().padStart(8, '0')}`
        codeIdx++
        woData.push({
          wo_code,
          mo_id: moId,
          source_routing_op_id: op.id,
          sequence: op.sequence,
          work_center_id: op.workcenter_id,
          expected_duration_min,
          setup_time_min: 0,
          bom_assembly_id: line.bom_assembly_id,
          bom_dispatch_id_snapshot: dispatchId,
          status: 'NOT_STARTED',
          created_by: userName,
        })
      }
    }

    await tx.work_order.createMany({ data: woData })
    return woCount
  }

  private computeDuration(
    op: { time_cycle: unknown; time_cycle_manual: unknown; activities_snapshot: unknown },
    vars: Record<string, number>,
    formulaMap: Map<string, string>,
  ): number {
    type SnapAct = { formula_code?: string | null; per_minute?: number | string | null }
    const snapshot = Array.isArray(op.activities_snapshot)
      ? (op.activities_snapshot as SnapAct[])
      : null

    if (snapshot && snapshot.length > 0) {
      let totalMin = 0
      let hasFormula = false
      for (const act of snapshot) {
        const rate = Number(act.per_minute ?? 0)
        if (!act.formula_code || rate <= 0) continue
        const expr = formulaMap.get(act.formula_code)
        if (!expr) continue
        try {
          const qty = this.parser.evaluate(expr, vars)
          if (qty > 0) {
            totalMin += qty / rate
            hasFormula = true
          }
        } catch {
          // Formula eval failed (missing variable) — skip this activity
        }
      }
      if (hasFormula && totalMin > 0) return Math.round(totalMin)
    }

    return Math.round(Number(op.time_cycle_manual ?? op.time_cycle ?? 0))
  }
}
