import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export const ACTIVITY_KINDS = ['run', 'setup', 'move', 'inspect'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export class ConsumeEntryDto {
  @IsInt() @Min(1)
  material_id: number

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

  @ApiPropertyOptional({ description: 'Activity kind — setup time is summed separately from run time', enum: ACTIVITY_KINDS, example: 'run' })
  @IsOptional()
  @IsIn(ACTIVITY_KINDS)
  kind?: ActivityKind

  @ApiPropertyOptional({ description: 'mrp_op_type.id this activity belongs to — omit/null means it applies to every operation type', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  operation_type_id?: number | null

  @ApiProperty({ description: 'Duration in minutes (≥ 0)', example: 5.5 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  duration_min: number

  @ApiPropertyOptional({ description: 'Production rate (units/min). Derived as ratio / per_time whenever both are set — only used as-is otherwise', example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  per_minute?: number

  @ApiPropertyOptional({ description: 'routing_formula_param.code for dynamic duration calc', example: 'cut_length_mm' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  formula_code?: string

  @ApiPropertyOptional({ description: 'Batch size — every N units takes per_time min', example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  ratio?: number

  @ApiPropertyOptional({ description: 'Unit of ratio', example: 'mm' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ratio_unit?: string

  @ApiPropertyOptional({ description: 'Minutes per ratio batch', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  per_time?: number
}
