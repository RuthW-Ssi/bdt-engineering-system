import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

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
  @IsBoolean()
  active?: boolean
}
