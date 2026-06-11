import { IsOptional, IsString, IsEnum } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { EquipmentStatus } from '@prisma/client'

export class QueryMachineDto {
  @ApiPropertyOptional({ enum: EquipmentStatus })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  area?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string
}
