import { IsBoolean, IsOptional, IsString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Department — free text; "admin" is the reserved bypass-all value' })
  @IsOptional()
  @IsString()
  role?: string

  @ApiPropertyOptional({ description: 'Org level — descriptive only, no permission effect' })
  @IsOptional()
  @IsString()
  level?: string

  @ApiPropertyOptional({ description: 'Job title — descriptive only, no permission effect' })
  @IsOptional()
  @IsString()
  job_title?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}
