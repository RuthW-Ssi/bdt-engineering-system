import { ApiProperty } from '@nestjs/swagger'
import type { ProductSpecPreset } from '../../../common/types/spec-preset.types'

export class PaintAssemblyBreakdownDto {
  @ApiProperty() assembly_id: number
  @ApiProperty() assembly_mark: string
  @ApiProperty() area_m2: number
  @ApiProperty() qty: number
  @ApiProperty() layers: number
  @ApiProperty() gallons: number
}

export class MbomMaterialItemDto {
  @ApiProperty() material_id: number
  @ApiProperty() material_name: string
  @ApiProperty() paint_type: string
  @ApiProperty() total_area_m2: number
  @ApiProperty() total_qty_gallon: number
  @ApiProperty() micron: number
  @ApiProperty() coverage_sqm_per_gallon: number
  @ApiProperty({ type: [PaintAssemblyBreakdownDto] }) assembly_breakdown: PaintAssemblyBreakdownDto[]
}

export class MbomByTypeDto {
  @ApiProperty() paint_type: string
  @ApiProperty({ type: [MbomMaterialItemDto] }) items: MbomMaterialItemDto[]
  @ApiProperty() subtotal_gallon: number
}

export class MbomSummaryDto {
  @ApiProperty() dispatch_id: number
  @ApiProperty() computed_at: string | null
  @ApiProperty({ type: [MbomByTypeDto] }) by_paint_type: MbomByTypeDto[]
  @ApiProperty() grand_total_gallon: number
}

export class PaintConfigAssemblyDto {
  @ApiProperty() assembly_id: number
  @ApiProperty() assembly_mark: string
  @ApiProperty({ nullable: true }) name: string | null
  @ApiProperty({ nullable: true }) surface_area_m2: number | null
  @ApiProperty() assembly_qty: number
  @ApiProperty() configs: {
    paint_type: string
    material_id: number | null
    layers: number
    material_name: string | null
  }[]
}

export class PaintConfigResponseDto {
  @ApiProperty() dispatch_id: number
  @ApiProperty({ type: [PaintConfigAssemblyDto] }) assemblies: PaintConfigAssemblyDto[]
  @ApiProperty({ description: 'Standard products with spec presets — use to pre-fill config' })
  available_presets: ProductSpecPreset[]
}
