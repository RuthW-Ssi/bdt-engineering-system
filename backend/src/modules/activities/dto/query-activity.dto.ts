import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryActivityDto {
  @ApiPropertyOptional({ description: 'Search by name (case-insensitive partial)', example: 'cut' })
  @IsOptional()
  @IsString()
  q?: string

  @ApiPropertyOptional({ description: 'Filter by consumed material (materials.id)', example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  material_id?: number

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ description: 'Items per page', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}
