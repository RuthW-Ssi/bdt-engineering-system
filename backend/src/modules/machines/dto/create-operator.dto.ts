import { IsString, IsOptional, IsIn, MaxLength, IsArray, ValidateNested, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class SkillEntryDto {
  @IsInt()
  @Min(1)
  skill_id: number

  @IsOptional()
  @IsString()
  @IsIn(['A', 'B+', 'B', 'C'])
  level?: string
}

export class CreateOperatorDto {
  @IsString()
  @MaxLength(40)
  code: string

  @IsString()
  @MaxLength(120)
  name: string

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
