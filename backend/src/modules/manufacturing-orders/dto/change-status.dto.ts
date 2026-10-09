import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator'
import { MoStatus } from '@prisma/client'

/** PATCH /mo/:id/status — reason written to mo_status_history; required for
 *  every move except Confirm and Start (2026-10-09, enforced in the service). */
export class ChangeStatusDto {
  @IsEnum(MoStatus)
  to_status: MoStatus

  @IsOptional()
  @IsString()
  reason?: string

  // User-typed, required only for DONE (2026-10-01) — enforced in the service.
  @IsOptional()
  @IsISO8601()
  actual_start?: string

  @IsOptional()
  @IsISO8601()
  actual_finish?: string
}
