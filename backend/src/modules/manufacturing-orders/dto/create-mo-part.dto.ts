import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Length, Max, Min, ValidateNested } from 'class-validator'
import { PART_SOURCES, PartSource } from '../mo-part/part-lines'

// Upper bounds keep values inside the DECIMAL columns (400 instead of a DB 500).

export class HoleDto {
  @IsNumber() @IsPositive() @Max(1000) diameter_mm: number
  @IsInt() @IsPositive() @Max(10000) count: number
}

export class PartLineDto {
  @IsOptional() @IsString() @Length(0, 60) mark?: string | null
  @IsString() @Length(1, 60) profile: string
  @IsString() @Length(1, 20) grade: string
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(99999999) length_mm: number
  @IsInt() @IsPositive() @Max(999999999) qty: number
  @IsOptional() @IsNumber() @Min(0) @Max(999999999) unit_weight_kg?: number | null
  @IsOptional() @IsString() part_mark?: string | null
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @IsInt({ each: true }) bom_part_ids?: number[]
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => HoleDto) holes?: HoleDto[]
  @IsOptional() @IsNumber() @Min(0) @Max(9999999999) cut_length_mm?: number | null
}

export class PartMarkDto {
  @IsString() @Length(1, 60) mark: string
  @IsNumber() @IsPositive() @Max(999999999) set_qty: number
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) length_mm: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) width_mm: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) height_mm: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(999999999) weight_kg?: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(9999) tw_mm?: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(9999) tf_mm?: number | null
}

export class SourceFileDto {
  @IsIn(PART_SOURCES) kind: PartSource
  @IsString() @Length(1, 255) filename: string
}

export class CreateMoPartDto {
  @IsInt() @IsPositive() project_id: number
  @IsInt() @IsPositive() zone_id: number
  @IsOptional() @IsInt() @IsPositive() sub_zone_id?: number | null
  @IsString() @Length(1, 10) primary_mark_prefix_code: string
  @IsInt() @IsPositive() routing_template_id: number
  @IsArray() @IsIn(PART_SOURCES, { each: true }) part_sources: PartSource[]
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SourceFileDto) source_files?: SourceFileDto[]
  @IsOptional() @IsISO8601() plan_start?: string
  @IsOptional() @IsISO8601() plan_finish?: string
  @IsOptional() @IsBoolean() confirm?: boolean
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => PartMarkDto) part_marks?: PartMarkDto[]
  @IsArray() @ArrayMaxSize(10000) @ValidateNested({ each: true }) @Type(() => PartLineDto) part_lines: PartLineDto[]
}

export class UpdateMoPartDto {
  @IsString() @Length(1, 10) primary_mark_prefix_code: string
  @IsInt() @IsPositive() routing_template_id: number
  @IsOptional() @IsISO8601() plan_start?: string
  @IsOptional() @IsISO8601() plan_finish?: string
  @IsOptional() @IsArray() @IsIn(PART_SOURCES, { each: true }) part_sources?: PartSource[]
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SourceFileDto) source_files?: SourceFileDto[]
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => PartMarkDto) part_marks?: PartMarkDto[]
  @IsArray() @ArrayMaxSize(10000) @ValidateNested({ each: true }) @Type(() => PartLineDto) part_lines: PartLineDto[]
  @IsOptional() @IsString() @Length(0, 1000) note?: string
}
