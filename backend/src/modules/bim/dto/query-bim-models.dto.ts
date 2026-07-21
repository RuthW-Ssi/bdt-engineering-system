import { IsInt, IsOptional, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class QueryBimModelsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  project_id?: number
}
