import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CreateActivityTemplateDto {
  @IsNotEmpty() @IsString() op_code: string
  @IsNotEmpty() @IsString() @MaxLength(200) description: string
  @IsInt() @Min(1) workcenter_id: number
  @IsNotEmpty() @IsString() formula_param_code: string
  @IsNumber() @Min(0) per_minute: number
  @IsNumber() @Min(0) std_measure: number
  @IsNotEmpty() @IsString() unit: string
  @IsOptional() @IsNumber() @Min(0) manpower?: number
  @IsOptional() @IsInt() @Min(0) sequence?: number
  @IsOptional() @IsString() equipment_ref?: string
  @IsOptional() @IsString() consumable_note?: string
}

export class UpdateActivityTemplateDto {
  @IsOptional() @IsString() op_code?: string
  @IsOptional() @IsString() @MaxLength(200) description?: string
  @IsOptional() @IsInt() @Min(1) workcenter_id?: number
  @IsOptional() @IsString() formula_param_code?: string
  @IsOptional() @IsNumber() @Min(0) per_minute?: number
  @IsOptional() @IsNumber() @Min(0) std_measure?: number
  @IsOptional() @IsString() unit?: string
  @IsOptional() @IsNumber() @Min(0) manpower?: number
  @IsOptional() @IsInt() @Min(0) sequence?: number
  @IsOptional() @IsString() equipment_ref?: string
  @IsOptional() @IsString() consumable_note?: string
}
