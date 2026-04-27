import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsInt, MaxLength } from 'class-validator'

export class CreateProjectDto {
  @ApiProperty({ example: '0X203' })
  @IsString()
  @MaxLength(20)
  project_code: string

  @ApiProperty({ example: 'Factory Chonburi Phase 2' })
  @IsString()
  @MaxLength(200)
  name: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  customer_id?: number

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsString()
  start_date?: string

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  target_handover?: string
}
