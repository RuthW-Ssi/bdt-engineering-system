import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator'

/** pause / cancel — reason is required and written to work_order_event.notes. */
export class WoReasonDto {
  @IsString()
  @MinLength(1)
  reason: string
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
