import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class UpdateOperationDto {
  @IsString() @IsOptional() @MaxLength(60)
  name?: string

  @IsInt() @IsOptional() @Min(1)
  sequence?: number

  @IsInt() @IsOptional()
  workcenter_id?: number
}
