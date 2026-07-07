import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator'

/**
 * pause / cancel — reason is required and written to work_order_event.notes.
 *
 * `qty_reusable` is only meaningful for cancel (structurally optional here,
 * same reasoning as AcceptVersionDto — pause ignores it entirely): required
 * when cancelling a WO with qty_done > 0, enforced in
 * `WorkOrdersService.transition()` since only the WO's current qty_done is
 * knowable once the service loads the WO, not via class-validator.
 */
export class WoReasonDto {
  @IsString()
  @MinLength(1)
  reason: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_reusable?: number
}

/** release / start / resume — optional free-text note on the event. */
export class WoNoteDto {
  @IsOptional()
  @IsString()
  notes?: string
}

/** done — qty_done required; qty_scrapped + notes optional. */
export class WoDoneDto {
  @IsNumber()
  @Min(0)
  qty_done: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_scrapped?: number

  @IsOptional()
  @IsString()
  notes?: string
}
