import { IsInt, IsOptional, IsString, IsNumber, MaxLength, Min } from 'class-validator'

export class CreateCustomRoutingDto {
  @IsInt() @IsOptional()
  from_template_id?: number
}

export class AddCustomRoutingOpDto {
  @IsString() @MaxLength(30)
  op_code: string

  @IsString() @MaxLength(60)
  name: string

  @IsInt()
  workcenter_id: number

  @IsInt() @IsOptional() @Min(1)
  sequence?: number
}

export class UpdateCustomRoutingOpDto {
  @IsString() @IsOptional() @MaxLength(60)
  name?: string

  @IsInt() @IsOptional() @Min(1)
  sequence?: number

  @IsInt() @IsOptional()
  workcenter_id?: number
}

export class AddCustomRoutingActivityDto {
  @IsString() @MaxLength(200)
  description: string

  @IsNumber() @Min(0)
  per_minute: number

  @IsString() @MaxLength(40)
  formula_param_code: string

  @IsNumber() @Min(0)
  std_measure: number

  @IsString() @MaxLength(20)
  unit: string

  @IsNumber() @IsOptional() @Min(0)
  manpower?: number

  @IsInt()
  workcenter_id: number

  @IsInt() @IsOptional() @Min(1)
  sequence?: number
}

export class RestoreToTemplateDto {
  @IsInt()
  template_id: number
}
