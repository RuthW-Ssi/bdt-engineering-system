import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class OperationDto {
  @IsString() op_code: string
  @IsOptional() @IsString() name?: string
  @IsInt() workcenter_id: number
  @IsOptional() @IsInt() sequence?: number
  @IsOptional() @IsArray() @IsInt({ each: true }) activity_template_ids?: number[]
}

export class CreateRoutingDto {
  @IsOptional() @IsString() from_template?: string
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OperationDto)
  operations?: OperationDto[]
}
