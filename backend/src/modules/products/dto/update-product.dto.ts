import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean, IsNumber, IsObject, MaxLength } from 'class-validator'

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sale_ok?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  purchase_ok?: boolean

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  engineer_hours_est?: number
}
