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
