import { IsString, IsEnum } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { EquipmentStatus } from '@prisma/client'

export class ChangeStatusDto {
  @ApiProperty({ enum: EquipmentStatus })
  @IsEnum(EquipmentStatus)
  new_status: EquipmentStatus

  @ApiProperty()
  @IsString()
  reason: string

  @ApiProperty()
  @IsString()
  changed_by: string
}
