import { IsIn, IsString, MaxLength } from 'class-validator'

export const TEAM_TYPES = ['internal', 'external'] as const
export type TeamType = (typeof TEAM_TYPES)[number]

export class CreateTeamDto {
  @IsString()
  @MaxLength(40)
  code: string

  @IsString()
  @MaxLength(120)
  name: string

  @IsIn(TEAM_TYPES)
  team_type: TeamType
}
