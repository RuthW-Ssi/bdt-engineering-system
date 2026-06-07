import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, IsArray, IsNumber, Min, MaxLength } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateActivityDto {
  @ApiProperty({ description: 'ชื่อกิจกรรม (max 120)', example: 'Cut H-beam web plate' })
  @IsString()
  @MaxLength(120)
  name: string

  @ApiProperty({ description: 'FK → equipment_resource.id', example: 5 })
  @IsInt()
  machine_id: number

  @ApiPropertyOptional({ description: 'FK → materials.id list (consumed materials, no qty)', example: [12, 34] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  consumes?: number[]

  @ApiProperty({ description: 'Duration in minutes (≥ 0)', example: 5.5 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  duration_min: number
}
