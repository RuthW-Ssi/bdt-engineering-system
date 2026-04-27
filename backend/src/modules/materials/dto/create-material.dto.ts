import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, IsObject, IsIn, MaxLength, MinLength } from 'class-validator'

export class CreateMaterialDto {
  @ApiProperty({ description: 'FK → product_category.id', example: 9 })
  @IsInt()
  categ_id: number

  @ApiProperty({ description: 'FK → uom_uom.id', example: 14 })
  @IsInt()
  uom_id: number

  @ApiPropertyOptional({ description: 'Purchase UoM FK', example: 14 })
  @IsOptional()
  @IsInt()
  uom_po_id?: number

  @ApiProperty({ description: 'ชื่อวัสดุภาษาไทย / หลัก', example: 'เหล็ก H-Beam SS400' })
  @IsString()
  @MaxLength(200)
  name: string

  @ApiProperty({
    description: 'ชื่อวัสดุภาษาอังกฤษพิมพ์ใหญ่ 2 ส่วน: "<ชื่อหลัก> <Spec/Dim>"',
    example: 'H-BEAM SS400 H=300 B=150 TW=6.5 TF=9',
  })
  @IsString()
  @MaxLength(200)
  description_sale: string

  @ApiPropertyOptional({ description: 'product|consu|service', default: 'product' })
  @IsOptional()
  @IsIn(['product', 'consu', 'service'])
  type?: string

  @ApiPropertyOptional({ description: 'Engineering attributes per group', type: Object })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>

  @ApiPropertyOptional({ example: 'DWG-HS-300' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  drawing_ref?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bim_object_id?: string

  @ApiPropertyOptional()
  @IsOptional()
  total_weight_kg?: number

  @ApiPropertyOptional({ description: 'Criticality A|B|C (Spare Part / Fixed Asset only)' })
  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  criticality?: string
}
