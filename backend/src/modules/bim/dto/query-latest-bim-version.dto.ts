import { IsInt, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

// Mirrors bom-upload's QueryLatestRevisionDto, scoped by project only — BIM
// models are uploaded at the whole-project level (confirmed 2026-07-21).
export class QueryLatestBimVersionDto {
  @ApiPropertyOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  project_id!: number
}
