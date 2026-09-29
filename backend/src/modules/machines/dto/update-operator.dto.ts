import { IsString, IsOptional, IsIn, IsBoolean, IsInt, IsPositive, MaxLength, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { SkillEntryDto, OPERATOR_NATIONALITIES } from './create-operator.dto'

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
  @IsIn(OPERATOR_NATIONALITIES)
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

  // null explicitly clears the team; undefined/omitted leaves it untouched.
  @IsOptional()
  @IsInt()
  @IsPositive()
  team_id?: number | null

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
