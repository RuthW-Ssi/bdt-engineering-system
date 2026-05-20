import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsBoolean, IsNumber, IsObject, MaxLength, ValidateNested } from 'class-validator'
import { PaintSpecPresetDto, WeldingSpecPresetDto } from './spec-preset.dto'

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

  @ApiPropertyOptional({ type: PaintSpecPresetDto, nullable: true, description: 'Replace paint spec entirely. Pass null to clear.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaintSpecPresetDto)
  default_paint_spec?: PaintSpecPresetDto | null

  @ApiPropertyOptional({ type: WeldingSpecPresetDto, nullable: true, description: 'Replace welding spec entirely. Pass null to clear.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeldingSpecPresetDto)
  default_welding_spec?: WeldingSpecPresetDto | null
}
