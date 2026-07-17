import { IsOptional, IsString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class QueryCuttingPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string
}
