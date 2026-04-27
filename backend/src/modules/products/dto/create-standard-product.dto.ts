import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsObject, Matches, MaxLength } from 'class-validator'

export class CreateStandardProductDto {
  @ApiProperty({ enum: ['standard'] })
  @IsIn(['standard'])
  product_type: 'standard'

  @ApiProperty({ example: 'Cee Purlin C-200' })
  @IsString()
  @MaxLength(200)
  name: string

  @ApiPropertyOptional({ example: 'BDTCM_001' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  engineering_code?: string

  @ApiPropertyOptional({ example: 'BDTC000123', description: 'Odoo 10-char Part Code' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{10}$/, { message: 'item_code must be exactly 10 uppercase alphanumeric characters' })
  item_code?: string

  @ApiProperty({ example: 1 })
  @IsInt()
  categ_id: number

  @ApiPropertyOptional({ default: 'product' })
  @IsOptional()
  @IsIn(['product', 'consu', 'service'])
  odoo_type?: string

  @ApiProperty({ default: false })
  @IsBoolean()
  sale_ok: boolean

  @ApiProperty({ default: false })
  @IsBoolean()
  purchase_ok: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cost_raw_material?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cost_transport?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cost_production?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cost_warehouse?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  variant_attributes?: Record<string, unknown>

  @ApiPropertyOptional({ enum: ['min_max', 'as_needed'] })
  @IsOptional()
  @IsIn(['min_max', 'as_needed'])
  stock_policy?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  reorder_min?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  reorder_max?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>
}
