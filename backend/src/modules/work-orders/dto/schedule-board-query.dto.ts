import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional } from 'class-validator'

/**
 * GET /schedule/board query. A DTO (not ParseIntPipe) on purpose: the global
 * ValidationPipe runs with transform:true, which turns a bare optional
 * `@Query('version_id') v?: number` into NaN when absent — ParseIntPipe would then
 * 400 every request without the param.
 */
export class ScheduleBoardQueryDto {
  @ApiPropertyOptional({ description: 'prod_schedule_version.id to show; falls back to active, then newest version with rows' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  version_id?: number
}
