import { IsInt, IsOptional, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class QueryDrawingDto {
  @ApiProperty({ example: '7' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  zone_id!: number

  @ApiPropertyOptional({ example: '3' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  sub_zone_id?: number
}
