import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { WoCodeGenerator } from './wo-code.generator'

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
 */
@Injectable()
export class WorkOrderAutoCreateService {
  constructor(private readonly codeGen: WoCodeGenerator) {}

  /** Returns the number of WOs created (0 if already present). */
  async createForMo(
    tx: Prisma.TransactionClient,
    moId: number,
    userName: string,
  ): Promise<number> {
    const existing = await tx.work_order.count({ where: { mo_id: moId } })
    if (existing > 0) return 0 // idempotent — re-confirm does not duplicate

    // Routing ops are the snapshot source (mo_operation dropped · the WO header carries
    // the full op snapshot, so we read structure live from the routing template at confirm).
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
              },
            },
          },
        },
      },
    })
    const ops = mo?.routing_template?.operations ?? []
    const lines = await tx.mo_assembly_line.findMany({
      where: { mo_id: moId },
      include: { bom_assembly: { select: { dispatch_id: true } } },
      orderBy: { line_seq: 'asc' },
    })

    let created = 0
    for (const line of lines) {
      const dispatchId = line.bom_assembly.dispatch_id // assembly's dispatch = snapshot anchor
      for (const op of ops) {
        const wo_code = await this.codeGen.generate(tx)
        await tx.work_order.create({
          data: {
            wo_code,
            mo_id: moId,
            source_routing_op_id: op.id, // soft ref → mrp_routing_workcenter.id (breadcrumb)
            sequence: op.sequence,
            work_center_id: op.workcenter_id,
            expected_duration_min: Math.round(Number(op.time_cycle_manual ?? op.time_cycle ?? 0)),
            setup_time_min: 0,
            // op_attributes omitted → DB default '{}' (no source on routing op)
            bom_assembly_id: line.bom_assembly_id,
            bom_dispatch_id_snapshot: dispatchId, // soft ref
            status: 'NOT_STARTED',
            created_by: userName,
          },
        })
        created++
      }
    }
    return created
  }
}
