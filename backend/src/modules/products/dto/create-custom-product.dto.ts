import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsString, IsOptional, IsInt, IsNumber, IsObject, MaxLength } from 'class-validator'

export class CreateCustomProductDto {
  @ApiProperty({ enum: ['custom'] })
  @IsIn(['custom'])
  product_type: 'custom'

  @ApiProperty({ example: 'Column C-1 WH' })
  @IsString()
  @MaxLength(200)
  name: string

  @ApiProperty({ example: 1 })
  @IsInt()
  categ_id: number

  @ApiProperty({ example: 1 })
  @IsInt()
  project_id: number

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  erection_zone_id?: number

  @ApiProperty({ example: 'C', description: 'FK → mark_prefix_master.code' })
  @IsString()
  @MaxLength(10)
  mark_prefix: string

  @ApiProperty({ example: '1' })
  @IsString()
  @MaxLength(20)
  mark_number: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  engineer_hours_est?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>
}
