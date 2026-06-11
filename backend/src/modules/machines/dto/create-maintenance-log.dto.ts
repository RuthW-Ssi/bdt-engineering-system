import { IsString, IsOptional, IsInt, IsDateString, IsArray } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class CreateMaintenanceLogDto {
  @ApiProperty()
  @IsDateString()
  performed_at: string

  @ApiProperty()
  @IsString()
  performed_by: string

  @ApiProperty()
  @IsString()
  description: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parts_replaced?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  duration_min?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_urls?: string[]
}
