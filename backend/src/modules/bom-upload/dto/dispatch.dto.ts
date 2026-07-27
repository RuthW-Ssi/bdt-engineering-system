import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class QueryDispatchDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  project_id?: number

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  zone_id?: number

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  sub_zone_id?: number

  @ApiPropertyOptional({ enum: ['pending', 'partial', 'complete'] })
  @IsOptional() @IsString()
  status?: string

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  limit?: number = 20
}

export class QueryDiffBimModelsDto {
  @ApiPropertyOptional({ description: "Override the 'old' panel — must be a complete bim_model of the dispatch's project" })
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  old_model_id?: number

  @ApiPropertyOptional({ description: "Override the 'new' panel — must be a complete bim_model of the dispatch's project" })
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  new_model_id?: number
}

export class QueryLatestRevisionDto {
  @ApiPropertyOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  project_id!: number

  @ApiPropertyOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  zone_id!: number

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value != null ? Number(value) : undefined) @IsInt() @Min(1)
  sub_zone_id?: number
}
