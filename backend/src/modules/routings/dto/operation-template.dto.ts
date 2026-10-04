import { Type } from 'class-transformer'
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator'

// Real class-validator DTOs for OperationTemplatesController (2026-09-28 security
// finding, High/BLOCK) — these were plain TS interfaces, so NestJS's global
// ValidationPipe (metatype === Object) silently skipped validation entirely on
// create/update, including the new `icon` field having no length/format check
// against its own `@db.VarChar(40)` column. Field lengths below match
// schema.prisma's operation_template / operation_template_activity /
// op_act_tool / op_act_skills columns exactly.
//
// Follow-up to the S11c release gate (PR #4, 17c27ca): non-empty names, a closed
// time_mode set (values used by the UI and the scheduler) and array caps so one
// request can't create an unbounded transaction (live max today: 8 activities).

export const TIME_MODES = ['formula', 'manual', 'by_activities'] as const
const MAX_ITEMS = 50
// '' and whitespace-only are both rejected (the service trims names before saving)
const NOT_BLANK = /\S/
// Update: undefined = leave as is; null is validated (and rejected) — these columns can't be cleared
const IfPresent = () => ValidateIf((_: object, v: unknown) => v !== undefined)

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
  @IsString() @Matches(NOT_BLANK) @MaxLength(200) name: string
  @IsString() @Matches(NOT_BLANK) @MaxLength(40) measure: string
  @IsOptional() @IsString() @MaxLength(20) unit?: string
  @IsOptional() @IsNumber() @Min(0) per_minute?: number
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_ITEMS) @ValidateNested({ each: true }) @Type(() => ToolIdQtyDto) tool_ids?: ToolIdQtyDto[]
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_ITEMS) @ValidateNested({ each: true }) @Type(() => ConsumableInputDto) consumables?: ConsumableInputDto[]
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_ITEMS) @ValidateNested({ each: true }) @Type(() => LaborInputDto) skills?: LaborInputDto[]
  @IsOptional() @IsInt() sequence?: number
  @IsOptional() @IsInt() source_activity_id?: number | null
  @IsOptional() @IsISO8601() snapshot_at?: string | null
}

export class CreateOperationTemplateDto {
  @IsString() @Matches(NOT_BLANK) @MaxLength(40) op_code: string
  @IsString() @Matches(NOT_BLANK) @MaxLength(100) name: string
  @IsOptional() @IsInt() op_type_id?: number
  @IsOptional() @IsInt() workcenter_id?: number
  @IsOptional() @IsString() @MaxLength(20) method?: string
  @IsOptional() @IsIn(TIME_MODES) time_mode?: string
  @IsOptional() @IsNumber() @Min(0) duration_min?: number
  @IsOptional() @IsString() @MaxLength(400) formula_expr?: string
  @IsOptional() @IsString() @MaxLength(40) icon?: string | null
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_ITEMS) @ValidateNested({ each: true }) @Type(() => CreateOpTemplateActivityDto) activities?: CreateOpTemplateActivityDto[]
}

export class UpdateOperationTemplateDto {
  @IsOptional() @IsString() @Matches(NOT_BLANK) @MaxLength(100) name?: string
  @IsOptional() @IsInt() op_type_id?: number | null
  @IsOptional() @IsInt() workcenter_id?: number | null
  @IsOptional() @IsString() @MaxLength(20) method?: string | null
  @IfPresent() @IsIn(TIME_MODES) time_mode?: string
  @IsOptional() @IsNumber() @Min(0) duration_min?: number | null
  @IsOptional() @IsString() @MaxLength(400) formula_expr?: string | null
  @IsOptional() @IsString() @MaxLength(40) icon?: string | null
  @IfPresent() @IsArray() @ArrayMaxSize(MAX_ITEMS) @ValidateNested({ each: true }) @Type(() => CreateOpTemplateActivityDto) activities?: CreateOpTemplateActivityDto[]
}
