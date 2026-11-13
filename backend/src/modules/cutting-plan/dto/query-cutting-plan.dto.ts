import { IsIn, IsOptional, IsString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class QueryCuttingPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string

  @ApiPropertyOptional({ enum: ['PLATE', 'SHAPE'], description: 'defaults to PLATE' }) @IsOptional() @IsIn(['PLATE', 'SHAPE'])
  plan_type?: 'PLATE' | 'SHAPE'
}
