import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, MaxLength, ValidateNested, IsPositive } from 'class-validator'
import { Type } from 'class-transformer'

export class ConsumeEntryDto {
  @IsInt() @Min(1)
  resource_id: number

  @IsOptional() @IsInt() @Min(1)
  formula_id?: number
}

export class ToolEntryDto {
  @IsInt() @Min(1)
  resource_id: number

  @IsInt() @Min(1)
  qty: number
}

export class LaborEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  skill: string

  @IsInt()
  @Min(1)
  qty: number

  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string
}

export class CreateActivityDto {
  @ApiProperty({ description: 'ชื่อกิจกรรม (max 120)', example: 'Cut H-beam web plate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string

  @ApiPropertyOptional({ description: 'FK → equipment_resource.id', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  machine_id?: number

  @ApiPropertyOptional({ description: 'Consumed materials with optional formula', example: [{ resource_id: 12, formula_id: 3 }] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsumeEntryDto)
  consumes?: ConsumeEntryDto[]

  @ApiPropertyOptional({ description: 'Required skills with quantity', example: [{ skill: 'ช่างเชื่อม MIG', qty: 2 }] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LaborEntryDto)
  labors?: LaborEntryDto[]

  @ApiPropertyOptional({ description: 'Tools/jigs with quantity', example: [{ resource_id: 7, qty: 2 }] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolEntryDto)
  tools?: ToolEntryDto[]

  @ApiProperty({ description: 'Duration in minutes (≥ 0)', example: 5.5 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  duration_min: number
}
