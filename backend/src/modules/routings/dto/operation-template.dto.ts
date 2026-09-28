import { Type } from 'class-transformer'
import { IsArray, IsInt, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator'

// Real class-validator DTOs for OperationTemplatesController (2026-09-28 security
// finding, High/BLOCK) — these were plain TS interfaces, so NestJS's global
// ValidationPipe (metatype === Object) silently skipped validation entirely on
// create/update, including the new `icon` field having no length/format check
// against its own `@db.VarChar(40)` column. Field lengths below match
// schema.prisma's operation_template / operation_template_activity /
// op_act_tool / op_act_skills columns exactly.

export class ToolIdQtyDto {
  @IsInt() id: number
  @IsInt() @Min(0) qty: number
}

export class ConsumableInputDto {
  @IsInt() resource_id: number
  @IsOptional() @IsNumber() qty?: number | null
  @IsOptional() @IsString() @MaxLength(20) unit?: string | null
  @IsOptional() @IsInt() formula_id?: number | null
}

export class LaborInputDto {
  @IsString() @MaxLength(80) skill: string
  @IsInt() @Min(0) qty: number
  @IsOptional() @IsString() @MaxLength(20) level?: string | null
}

export class CreateOpTemplateActivityDto {
  @IsString() @MaxLength(200) name: string
  @IsString() @MaxLength(40) measure: string
  @IsOptional() @IsString() @MaxLength(20) unit?: string
  @IsOptional() @IsNumber() @Min(0) per_minute?: number
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ToolIdQtyDto) tool_ids?: ToolIdQtyDto[]
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ConsumableInputDto) consumables?: ConsumableInputDto[]
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LaborInputDto) skills?: LaborInputDto[]
  @IsOptional() @IsInt() sequence?: number
  @IsOptional() @IsInt() source_activity_id?: number | null
  @IsOptional() @IsISO8601() snapshot_at?: string | null
}

export class CreateOperationTemplateDto {
  @IsString() @MaxLength(40) op_code: string
  @IsString() @MaxLength(100) name: string
  @IsOptional() @IsInt() op_type_id?: number
  @IsOptional() @IsInt() workcenter_id?: number
  @IsOptional() @IsString() @MaxLength(20) method?: string
  @IsOptional() @IsString() @MaxLength(20) time_mode?: string
  @IsOptional() @IsNumber() @Min(0) duration_min?: number
  @IsOptional() @IsString() @MaxLength(400) formula_expr?: string
  @IsOptional() @IsString() @MaxLength(40) icon?: string | null
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOpTemplateActivityDto) activities?: CreateOpTemplateActivityDto[]
}

export class UpdateOperationTemplateDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string
  @IsOptional() @IsInt() op_type_id?: number | null
  @IsOptional() @IsInt() workcenter_id?: number | null
  @IsOptional() @IsString() @MaxLength(20) method?: string | null
  @IsOptional() @IsString() @MaxLength(20) time_mode?: string
  @IsOptional() @IsNumber() @Min(0) duration_min?: number | null
  @IsOptional() @IsString() @MaxLength(400) formula_expr?: string | null
  @IsOptional() @IsString() @MaxLength(40) icon?: string | null
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOpTemplateActivityDto) activities?: CreateOpTemplateActivityDto[]
}
