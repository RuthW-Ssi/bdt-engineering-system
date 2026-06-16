import { IsEnum, IsString, MinLength } from 'class-validator'
import { MoStatus } from '@prisma/client'

/** PATCH /mo/:id/status — reason is required and written to mo_status_history. */
export class ChangeStatusDto {
  @IsEnum(MoStatus)
  to_status: MoStatus

  @IsString()
  @MinLength(1)
  reason: string
}
