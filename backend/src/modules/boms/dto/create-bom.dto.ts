import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsIn, IsNumber, IsDateString, MaxLength } from 'class-validator'

export class CreateBomDto {
  @ApiProperty({ example: 'PROD-001', description: 'Product code to attach this BOM to' })
  @IsString()
  product_code: string

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string

  @ApiPropertyOptional({ enum: ['eBOM', 'mBOM', 'sBOM'], default: 'eBOM' })
  @IsOptional()
  @IsIn(['eBOM', 'mBOM', 'sBOM'])
  bom_view?: string

  @ApiPropertyOptional({ enum: ['engineering', 'production', 'supply_chain'], default: 'engineering' })
  @IsOptional()
  @IsIn(['engineering', 'production', 'supply_chain'])
  owner_role?: string

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  product_qty?: number

  @ApiProperty({ example: 1, description: 'UOM id' })
  @IsNumber()
  product_uom_id: number

  @ApiPropertyOptional({ enum: ['normal', 'phantom', 'kit'], default: 'normal' })
  @IsOptional()
  @IsIn(['normal', 'phantom', 'kit'])
  bom_type?: string

  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  effective_from?: string

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  effective_to?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string
}
