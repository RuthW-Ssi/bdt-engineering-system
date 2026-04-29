import { IsArray, IsInt, IsOptional, IsString } from 'class-validator'

export class AddOperationDto {
  @IsString() op_code: string
  @IsOptional() @IsString() name?: string
  @IsInt() workcenter_id: number
  @IsOptional() @IsInt() sequence?: number
  @IsOptional() @IsArray() @IsInt({ each: true }) activity_template_ids?: number[]
}
