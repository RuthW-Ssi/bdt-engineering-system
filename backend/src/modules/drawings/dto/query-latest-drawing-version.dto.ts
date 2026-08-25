import { IsInt, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

// Mirrors bim's QueryLatestBimVersionDto — scoped by project only.
export class QueryLatestDrawingVersionDto {
  @ApiPropertyOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  project_id!: number
}
