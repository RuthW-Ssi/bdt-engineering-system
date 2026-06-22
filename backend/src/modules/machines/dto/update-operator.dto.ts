import { IsString, IsOptional, IsIn, MaxLength, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { SkillEntryDto } from './create-operator.dto'

export class UpdateOperatorDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsIn(['TH', 'MM'])
  nationality?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position_raw?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  start_raw?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillEntryDto)
  skills?: SkillEntryDto[]
}
