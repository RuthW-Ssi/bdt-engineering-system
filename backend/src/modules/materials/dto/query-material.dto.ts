import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryMaterialDto {
  @ApiPropertyOptional({ description: 'Filter by state', example: 'draft' })
  @IsOptional()
  @IsString()
  state?: string

  @ApiPropertyOptional({ description: 'Filter by categ_id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categ_id?: number

  @ApiPropertyOptional({ description: 'Full-text search on name / description_sale / default_code' })
  @IsOptional()
  @IsString()
  q?: string

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20
}
