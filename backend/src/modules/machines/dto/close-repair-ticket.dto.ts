import { IsString, IsOptional, IsInt, IsDateString, IsArray } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class CloseRepairTicketDto {
  @ApiProperty()
  @IsString()
  repaired_by: string

  @ApiProperty()
  @IsDateString()
  closed_at: string

  @ApiProperty()
  @IsString()
  repair_description: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parts_replaced?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  duration_min?: number

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos_after?: string[]
}
