import { IsString, MaxLength } from 'class-validator'

export class CreateTeamDto {
  @IsString()
  @MaxLength(40)
  code: string

  @IsString()
  @MaxLength(120)
  name: string
}
