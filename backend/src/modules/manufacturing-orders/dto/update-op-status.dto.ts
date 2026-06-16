import { IsEnum } from 'class-validator'
import { MoOperationStatus } from '@prisma/client'

/** PATCH /mo/:id/operations/:opId/status — pilot v1: status only, no timestamps (P22). */
export class UpdateOpStatusDto {
  @IsEnum(MoOperationStatus)
  status: MoOperationStatus
}
