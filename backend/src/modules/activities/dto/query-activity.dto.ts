import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryActivityDto {
  @ApiPropertyOptional({ description: 'Search by name (case-insensitive partial)', example: 'cut' })
  @IsOptional()
  @IsString()
  q?: string

  @ApiPropertyOptional({ description: 'Filter by machine (equipment_resource.id)', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  machine_id?: number

  @ApiPropertyOptional({ description: 'Filter by consumed material (materials.id)', example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  material_id?: number
}
