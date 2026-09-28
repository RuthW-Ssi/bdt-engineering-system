import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { MarkQcBreakdownDto } from './mark-qc-breakdown.dto'

/**
 * pause / hold — reason required, written to work_order_event.notes.
 * (Multi-mark redesign, 2026-09-17: cancel's disposition moved to CancelWoDto
 * below — a whole-WO cancel now needs a QC breakdown PER mark, not a scalar.)
 */
export class WoReasonDto {
  @IsString()
  @MinLength(1)
  reason: string
}

/** release / start / resume — optional free-text note on the event. Also covers
 *  "resume" from ON_HOLD (WorkOrdersService.resume()'s unhold branch). */
export class WoNoteDto {
  @IsOptional()
  @IsString()
  notes?: string
}

/** One mark's QC breakdown when cancelling the whole WO — only required (enforced
 *  in WorkOrdersService.cancel()) for a mark whose qty_done > 0. */
export class MarkDispositionDto extends MarkQcBreakdownDto {
  @IsInt()
  @IsPositive()
  bom_assembly_id: number
}

/**
 * cancel (whole WO) — reason always required. `mark_disposition` must cover
 * every non-removed mark on the WO with qty_done > 0 (enforced in
 * WorkOrdersService.cancel(), not here — only the WO's current per-mark qty_done
 * is knowable once the service loads it).
 */
export class CancelWoDto {
  @IsString()
  @MinLength(1)
  reason: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkDispositionDto)
  mark_disposition?: MarkDispositionDto[]
}

/**
 * One mark's completion input for POST /wo/:id/done. qty_not_started/
 * qty_in_progress (2026-09-23) are a work-state breakdown of qty_planned,
 * entered the same way as the QC fields — optional, capped in the service
 * (qty_not_started + qty_in_progress + qty_done ≤ qty_planned).
 */
export class WoDoneMarkDto extends MarkQcBreakdownDto {
  @IsInt()
  @IsPositive()
  bom_assembly_id: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_not_started?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_in_progress?: number

  @IsNumber()
  @Min(0)
  qty_done: number
}

/**
 * done — `marks` must cover every non-removed work_order_mark on the WO (enforced
 * in WorkOrdersService.done(), not here — only the WO's current marks are
 * knowable once the service loads them).
 */
export class WoDoneDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WoDoneMarkDto)
  marks: WoDoneMarkDto[]

  @IsOptional()
  @IsString()
  notes?: string
}
