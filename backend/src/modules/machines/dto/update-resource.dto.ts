import { IsString, IsOptional, IsInt, IsNumber, MaxLength, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class UpdateEquipmentResourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string

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
