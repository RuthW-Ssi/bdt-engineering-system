import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsIn, IsInt } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryDrawingDto {
  @ApiPropertyOptional({ example: 'PROD-001' })
  @IsOptional()
  @IsString()
  product_code?: string

  @ApiPropertyOptional({ enum: ['master', 'project'] })
  @IsOptional()
  @IsIn(['master', 'project'])
  drawing_type?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  project_id?: number

  @ApiPropertyOptional({ enum: ['draft', 'in_review', 'approved', 'released', 'superseded', 'obsolete'] })
  @IsOptional()
  @IsIn(['draft', 'in_review', 'approved', 'released', 'superseded', 'obsolete'])
  state?: string
}
