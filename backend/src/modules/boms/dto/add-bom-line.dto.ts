import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsInt, IsNumber, IsString, MaxLength, Min } from 'class-validator'

export class AddBomLineDto {
  @ApiPropertyOptional({ description: 'Material ID (XOR with sub_product_id)' })
  @IsOptional()
  @IsInt()
  material_id?: number

  @ApiPropertyOptional({ description: 'Sub-product ID (XOR with material_id)' })
  @IsOptional()
  @IsInt()
  sub_product_id?: number

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number

  @ApiPropertyOptional({ example: 1.0 })
  @IsNumber()
  product_qty: number

  @ApiPropertyOptional({ example: 1, description: 'UOM id' })
  @IsInt()
  product_uom_id: number

  @ApiPropertyOptional({ example: 0, description: 'Scrap percentage' })
  @IsOptional()
  @IsNumber()
  scrap_pct?: number

  @ApiPropertyOptional({ example: 6000.0 })
  @IsOptional()
  @IsNumber()
  cutting_length_mm?: number

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  weight_per_unit_kg?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string

  @ApiPropertyOptional({ example: 'A1' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  part_mark?: string

  @ApiPropertyOptional({ example: 'UB 203x133x25' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  profile?: string

  @ApiPropertyOptional({ example: 'S275' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  grade?: string

  @ApiPropertyOptional({ example: 6000.0 })
  @IsOptional()
  @IsNumber()
  length_mm?: number

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber()
  area_m2?: number
}
