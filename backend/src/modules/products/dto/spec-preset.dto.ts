import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator'

export class PaintLayerPresetDto {
  @ApiProperty({ enum: ['primer', 'intermediate', 'fireproof', 'topcoat'] })
  @IsIn(['primer', 'intermediate', 'fireproof', 'topcoat'])
  paint_type: string

  @ApiProperty({ description: 'Number of coats', minimum: 1 })
  @IsInt()
  @Min(1)
  layers: number

  @ApiProperty({ description: 'Material default_code from materials table' })
  @IsString()
  material_code: string

  @ApiPropertyOptional({ description: 'DFT per coat in microns' })
  @IsOptional()
  @IsInt()
  @Min(1)
  microns?: number
}

export class WeldingSpecPresetDto {
  @ApiProperty({ description: 'Welding wire/rod material default_code' })
  @IsString()
  material_code: string

  @ApiProperty({ description: 'Weld leg size in mm', example: 6 })
  @IsNumber()
  @Min(1)
  fillet_mm: number

  @ApiProperty({ description: 'Number of sides to weld (1 or 2)', example: 2 })
  @IsInt()
  @Min(1)
  sides: number

  @ApiProperty({ description: 'Number of weld passes', example: 1 })
  @IsInt()
  @Min(1)
  weld_layers: number
}

export class PaintSpecPresetDto {
  @ApiProperty({ type: [PaintLayerPresetDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaintLayerPresetDto)
  layers: PaintLayerPresetDto[]
}
