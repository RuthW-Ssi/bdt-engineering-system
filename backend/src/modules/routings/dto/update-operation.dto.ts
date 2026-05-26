import { IsArray, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class UpdateOperationDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string
  @IsOptional() @IsInt() @Min(1) sequence?: number
  @IsOptional() @IsInt() workcenter_id?: number
  @IsOptional() @IsInt() op_type_id?: number
  @IsOptional() @IsString() @MaxLength(20) method?: string
  @IsOptional() @IsString() @MaxLength(10) time_mode?: string
  @IsOptional() @IsNumber() @Min(0) time_cycle_manual?: number
  @IsOptional() @IsString() @MaxLength(400) formula_expr?: string
  @IsOptional() @IsArray() @IsInt({ each: true }) activity_template_ids?: number[]
  @IsOptional() @IsNumber() canvas_x?: number
  @IsOptional() @IsNumber() canvas_y?: number
}
