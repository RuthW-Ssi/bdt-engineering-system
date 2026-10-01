import { IsEnum, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator'
import { MoStatus } from '@prisma/client'

/** PATCH /mo/:id/status — reason is required and written to mo_status_history. */
export class ChangeStatusDto {
  @IsEnum(MoStatus)
  to_status: MoStatus

  @IsString()
  @MinLength(1)
  reason: string

  // User-typed, required only for DONE (2026-10-01) — enforced in the service.
  @IsOptional()
  @IsISO8601()
  actual_start?: string

  @IsOptional()
  @IsISO8601()
  actual_finish?: string
}
