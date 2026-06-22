import { IsString, IsOptional, IsIn, IsInt, IsNumber, MaxLength, Min } from 'class-validator'
import { Type } from 'class-transformer'

const MACHINE_TYPES = ['machine', 'handling', 'tool', 'consumable'] as const

export class CreateEquipmentResourceDto {
  @IsIn(MACHINE_TYPES)
  type: 'machine' | 'handling' | 'tool' | 'consumable'

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string

  @IsString()
  @MaxLength(80)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  qty?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rate?: number

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rate_unit?: string
}
