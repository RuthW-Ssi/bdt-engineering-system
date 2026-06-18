import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsInt, IsDateString, MaxLength } from 'class-validator'

export class CreateZoneDto {
  @ApiProperty({ example: 'A1' })
  @IsString()
  @MaxLength(20)
  code: string

  @ApiProperty({ example: 'Area A1 - Main Hall' })
  @IsString()
  @MaxLength(80)
  label: string

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  erection_sequence?: number

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  target_erection_start?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  target_erection_end?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crane_assignment?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string
}
