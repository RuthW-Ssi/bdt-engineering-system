import { IsInt, IsPositive, IsString, MinLength } from 'class-validator'
import { MarkQcBreakdownDto } from './mark-qc-breakdown.dto'

/**
 * POST /wo/:id/remove-mark (multi-mark redesign, 2026-09-17) — soft-removes one
 * work_order_mark from a WO (removed_at/by/reason set, row kept for history).
 * Cascades to the same physical mark on sibling WOs of the same MO with no
 * output yet. The WO's last non-removed mark cannot be removed this way — cancel
 * the whole WO instead (enforced in WorkOrdersService.removeMark()).
 *
 * The QC breakdown fields (2026-09-23) are required only when the target
 * mark's qty_done > 0 — knowable only once the service loads the mark, so
 * enforced there, not via class-validator.
 */
export class RemoveMarkDto extends MarkQcBreakdownDto {
  @IsInt()
  @IsPositive()
  bom_assembly_id: number

  @IsString()
  @MinLength(1)
  reason: string
}
