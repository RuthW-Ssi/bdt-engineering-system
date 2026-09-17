import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { computeActivityDuration } from './activity-duration.util'

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

    // Resolve activities per op: prefer live operation_template.activities, fallback to activities_snapshot
    type ResolvedAct = { name: string; measure: string | null; per_minute: number | null; source_activity_id: number | null; tool_ids: { id: number; qty: number }[]; labors: { skill: string; qty: number; level: string | null }[] }
    const resolvedOps = ops.map(op => {
      const liveActs = op.operation_template?.activities ?? []
      const acts: ResolvedAct[] = liveActs.length > 0
        ? liveActs.map(a => ({
            name: a.name,
            measure: a.measure ?? null,
            per_minute: a.per_minute != null ? Number(a.per_minute) : null,
            source_activity_id: a.source_activity_id ?? null,
            tool_ids: a.tools.map(t => ({ id: t.resource_id, qty: t.qty })),
            labors: a.skills.map(s => ({ skill: s.skill, qty: s.qty, level: s.level ?? null })),
          }))
        : (Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as any[]) : [])
      return { ...op, resolvedActs: acts }
    })

    // Collect all source_activity_ids
    const allSourceIds = new Set<number>()
    for (const op of resolvedOps) {
      for (const a of op.resolvedActs) { if (a.source_activity_id) allSourceIds.add(a.source_activity_id) }
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

      for (const op of resolvedOps) {
        const { run_min, setup_min } = this.computeDuration(op.resolvedActs, bom, activityMap)
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
          op_attributes: { activities: op.resolvedActs },
          status: 'NOT_STARTED',
          created_by: userName,
        })
      }
    }

    await tx.work_order.createMany({ data: woData })
    return woCount
  }

  // Delegates to the shared computeActivityDuration (extracted 2026-09-15,
  // see that file's header comment) — same math, this call site just keeps
  // its original 2-field return shape and discards the per-activity
  // breakdown the MO print packet needs but WO creation doesn't.
  private computeDuration(
    acts: { name: string; source_activity_id: number | null }[],
    bom: { length_mm: unknown; surface_area_m2: unknown; width_mm: unknown },
    activityMap: Map<number, { formula_code: string | null; per_minute: unknown; duration_min: unknown; kind: string }>,
  ): { run_min: number; setup_min: number } {
    const { run_min, setup_min } = computeActivityDuration(acts, bom, activityMap)
    return { run_min, setup_min }
  }
}
