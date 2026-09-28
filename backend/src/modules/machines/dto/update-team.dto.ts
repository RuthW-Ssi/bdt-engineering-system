import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { TEAM_TYPES, TeamType } from './create-team.dto'

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsIn(TEAM_TYPES)
  team_type?: TeamType

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
