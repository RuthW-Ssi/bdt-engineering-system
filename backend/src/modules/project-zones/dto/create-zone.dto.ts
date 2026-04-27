import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsInt, IsIn, MaxLength } from 'class-validator'

export class CreateZoneDto {
  @ApiProperty({ example: 'A1' })
  @IsString()
  @MaxLength(20)
  code: string

  @ApiProperty({ example: 'Area A1 - Main Hall' })
  @IsString()
  @MaxLength(80)
  label: string

  @ApiProperty({ enum: ['building', 'gridline', 'zone', 'mezzanine'] })
  @IsIn(['building', 'gridline', 'zone', 'mezzanine'])
  zone_type: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  erection_sequence?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crane_assignment?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string
}
