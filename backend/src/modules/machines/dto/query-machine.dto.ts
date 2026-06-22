import { IsOptional, IsString, IsEnum, IsIn } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { EquipmentStatus } from '@prisma/client'

export const RESOURCE_TYPES = ['machine', 'handling', 'labor', 'tool', 'consumable'] as const
export type ResourceType = typeof RESOURCE_TYPES[number]

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

  @ApiPropertyOptional({ enum: RESOURCE_TYPES })
  @IsOptional()
  @IsIn(RESOURCE_TYPES)
  type?: ResourceType
}
