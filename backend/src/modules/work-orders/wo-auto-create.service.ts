import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

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
 * Duration logic:
 *   Looks up each snapshot activity's source_activity_id in the activity table
 *   to get formula_code, per_minute, duration_min, and kind.
 *   - setup activities  → setup_time_min += activity.duration_min (fixed)
 *   - run/inspect/move  → expected_duration_min += qty / per_minute
 *     where qty is derived from bom_assembly dimensions via formula_code.
 *   Falls back to time_cycle_manual ?? time_cycle when no activities match.
 */
@Injectable()
export class WorkOrderAutoCreateService {
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

    // Collect all source_activity_ids referenced across all op snapshots
    const allSourceIds = new Set<number>()
    for (const op of ops) {
      const snap = Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as any[]) : []
      for (const a of snap) { if (a.source_activity_id) allSourceIds.add(a.source_activity_id) }
    }

    // Load activity time data for duration computation
    type ActData = { formula_code: string | null; per_minute: unknown; duration_min: unknown; kind: string }
    const activityMap = new Map<number, ActData>()
    if (allSourceIds.size > 0) {
      const acts = await tx.activity.findMany({
        where: { id: { in: [...allSourceIds] } },
        select: { id: true, formula_code: true, per_minute: true, duration_min: true, kind: true },
      })
      for (const a of acts) activityMap.set(a.id, a)
    }

    const woCount = lines.length * ops.length
    if (woCount === 0) return 0

    // Batch-allocate all WO codes in one SELECT FOR UPDATE + UPDATE round-trip
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

      for (const op of ops) {
        const { run_min, setup_min } = this.computeDuration(op, bom, activityMap)
        const wo_code = `WO-${(firstCode + codeIdx).toString().padStart(8, '0')}`
        codeIdx++
        woData.push({
          wo_code,
          mo_id: moId,
          source_routing_op_id: op.id,
          sequence: op.sequence,
          work_center_id: op.workcenter_id,
          expected_duration_min: run_min,
          setup_time_min: setup_min,
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
    bom: { length_mm: unknown; surface_area_m2: unknown; width_mm: unknown },
    activityMap: Map<number, { formula_code: string | null; per_minute: unknown; duration_min: unknown; kind: string }>,
  ): { run_min: number; setup_min: number } {
    const snap = Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as any[]) : []
    const lengthMm   = Number(bom.length_mm       ?? 0)
    const areaSqM    = Number(bom.surface_area_m2  ?? 0)
    const widthMm    = Number(bom.width_mm         ?? 0)

    let runMin   = 0
    let setupMin = 0

    for (const snapAct of snap) {
      const srcId = snapAct.source_activity_id as number | null
      if (!srcId) continue
      const act = activityMap.get(srcId)
      if (!act) continue

      const rate        = Number(act.per_minute  ?? 0)
      const fixedMin    = Number(act.duration_min ?? 0)

      // Setup activities: always fixed time, goes into setup_time_min
      if (act.kind === 'setup') {
        setupMin += fixedMin
        continue
      }

      // Map formula_code → dimensional quantity
      switch (act.formula_code) {
        case 'weld_length_mm':
        case 'cut_length_mm':
        case 'edge_length_mm':
        case 'bevel_length_mm':
          runMin += rate > 0 ? lengthMm / rate : fixedMin
          break

        case 'product_area':
        case 'sumNet_surface_area':
          runMin += rate > 0 ? areaSqM / rate : fixedMin
          break

        // Perimeter expression yields mm, but per_minute is m/min → ÷1000
        case 'product_perimeter':
          runMin += rate > 0 ? (2 * lengthMm + 2 * widthMm) / 1000 / rate : fixedMin
          break

        // Count-based: count not stored in bom_assembly → use fixed duration_min
        case 'per_piece':
        case 'per unit':
        case 'bend_count':
        case 'hole_count':
        case 'tack_points':
        case 'assembly_point':
        case 'count_part':
        case 'cut_count':
          runMin += fixedMin
          break

        default:
          runMin += fixedMin
      }
    }

    // Fallback: no activities matched → use time_cycle
    if (runMin === 0 && setupMin === 0) {
      runMin = Number((op as any).time_cycle_manual ?? (op as any).time_cycle ?? 0)
    }

    return {
      run_min:   Math.max(1, Math.round(runMin)),
      setup_min: Math.max(0, Math.round(setupMin)),
    }
  }
}
