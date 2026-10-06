import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Length, Min, ValidateNested } from 'class-validator'
import { PART_SOURCES, PartSource } from '../mo-part/part-lines'

export class PartLineDto {
  @IsString() @Length(1, 60) profile: string
  @IsString() @Length(1, 20) grade: string
  @IsNumber() @IsPositive() length_mm: number
  @IsInt() @IsPositive() qty: number
  @IsOptional() @IsNumber() @Min(0) unit_weight_kg?: number | null
  @IsOptional() @IsString() part_mark?: string | null
  @IsOptional() @IsArray() @IsInt({ each: true }) bom_part_ids?: number[]
}

export class CreateMoPartDto {
  @IsInt() @IsPositive() project_id: number
  @IsString() @Length(1, 10) primary_mark_prefix_code: string
  @IsInt() @IsPositive() routing_template_id: number
  @IsIn(PART_SOURCES) part_source: PartSource
  @IsOptional() @IsString() @Length(0, 255) source_filename?: string | null
  @IsOptional() @IsISO8601() plan_start?: string
  @IsOptional() @IsISO8601() plan_finish?: string
  @IsOptional() @IsBoolean() confirm?: boolean
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PartLineDto) part_lines: PartLineDto[]
}

export class UpdateMoPartDto {
  @IsString() @Length(1, 10) primary_mark_prefix_code: string
  @IsInt() @IsPositive() routing_template_id: number
  @IsOptional() @IsISO8601() plan_start?: string
  @IsOptional() @IsISO8601() plan_finish?: string
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PartLineDto) part_lines: PartLineDto[]
}
