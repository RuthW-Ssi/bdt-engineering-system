import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator'
import { MarkQcBreakdownDto } from './mark-qc-breakdown.dto'

/**
 * accept-new-version (WO BOM-Version Hold, Sprint 20 — now per-mark, multi-mark
 * redesign 2026-09-17). `bom_assembly_id` selects WHICH of the WO's
 * work_order_mark rows to re-point (its CURRENT bom_assembly_id, i.e. the mark's
 * identity before this accept). `note` is always optional (the old "required
 * when resolving ON_HOLD" rule no longer applies — WOs are no longer
 * auto-held by BOM changes, so accept isn't tied to a hold-resolution flow
 * anymore). The QC breakdown fields (2026-09-23) are required only when that
 * mark's qty_done already exceeds the newly-adopted qty — knowable only once
 * the service loads the mark, so enforced in
 * WorkOrdersService.acceptNewVersion(), not here.
 * `apply_to_other_wos`: also re-point every OTHER WO in the same MO that has a
 * work_order_mark row for this same original bom_assembly_id.
 */
export class AcceptVersionDto extends MarkQcBreakdownDto {
  @IsInt()
  @IsPositive()
  bom_assembly_id: number

  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string

  @IsOptional()
  @IsBoolean()
  apply_to_other_wos?: boolean
}
