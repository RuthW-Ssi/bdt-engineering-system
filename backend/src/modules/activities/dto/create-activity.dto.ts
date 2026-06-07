import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class LaborEntryDto {
  @IsInt()
  @Min(1)
  id: number

  @IsInt()
  @Min(1)
  qty: number
}

export class CreateActivityDto {
  @ApiProperty({ description: 'ชื่อกิจกรรม (max 120)', example: 'Cut H-beam web plate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string

  @ApiProperty({ description: 'FK → equipment_resource.id', example: 5 })
  @IsInt()
  @Min(1)
  machine_id: number

  @ApiPropertyOptional({ description: 'FK → materials.id list (consumed materials, no qty)', example: [12, 34] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  consumes?: number[]

  @ApiPropertyOptional({ description: 'Labor resources with quantity', example: [{ id: 1, qty: 2 }] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LaborEntryDto)
  labors?: LaborEntryDto[]

  @ApiProperty({ description: 'Duration in minutes (≥ 0)', example: 5.5 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  duration_min: number
}
