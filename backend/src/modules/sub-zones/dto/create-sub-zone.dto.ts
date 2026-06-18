import { IsString, IsOptional, IsDateString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSubZoneDto {
  @ApiProperty({ example: 'Bay A' })
  @IsString()
  name: string

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  code?: string

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  due_date?: string
}
