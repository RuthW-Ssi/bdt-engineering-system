import { IsString, IsOptional, IsIn, MaxLength, IsArray, ValidateNested, IsInt, IsPositive, Min } from 'class-validator'
import { Type } from 'class-transformer'

// Must match the Add/Edit Operator form's options (ResourceList.tsx).
// LA added 2026-09-29 — the form offered it but saving failed.
export const OPERATOR_NATIONALITIES = ['TH', 'MM', 'LA']

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

  @IsOptional()
  @IsInt()
  @IsPositive()
  team_id?: number
}
