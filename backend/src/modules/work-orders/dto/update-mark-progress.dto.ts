import { IsDefined, IsNumber, IsObject, IsOptional, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

/** The six values as the client loaded them — optimistic concurrency check
 *  (null = the field was empty). A mismatch with the stored row → 409. */
export class ExpectedMarkProgressDto {
  @IsOptional() @IsNumber() @Min(0) qty_not_started?: number | null
  @IsOptional() @IsNumber() @Min(0) qty_in_progress?: number | null
  @IsOptional() @IsNumber() @Min(0) qty_done?: number | null
  @IsOptional() @IsNumber() @Min(0) qty_qc_passed?: number | null
  @IsOptional() @IsNumber() @Min(0) qty_rework?: number | null
  @IsOptional() @IsNumber() @Min(0) qty_renew?: number | null
}

/** PATCH /wo/:id/marks/:markId/progress (2026-10-05) — absolute new totals
 *  for one mark. Range/sum rules are checked in the service against qty_planned. */
export class UpdateMarkProgressDto {
  @IsNumber() @Min(0) qty_not_started: number
  @IsNumber() @Min(0) qty_in_progress: number
  @IsNumber() @Min(0) qty_done: number
  @IsNumber() @Min(0) qty_qc_passed: number
  @IsNumber() @Min(0) qty_rework: number
  @IsNumber() @Min(0) qty_renew: number

  // Required (fix wave 2026-10-05): a missing `expected` is a 400, not a
  // misleading 409 STALE_PROGRESS from the service's conditional update.
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ExpectedMarkProgressDto)
  expected: ExpectedMarkProgressDto
}
