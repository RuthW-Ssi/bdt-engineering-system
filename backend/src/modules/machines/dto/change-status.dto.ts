import { IsString, IsEnum, IsOptional, IsInt } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  related_repair_id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  related_maintenance_id?: number
}
