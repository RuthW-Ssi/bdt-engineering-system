import { ApiProperty } from '@nestjs/swagger'
import type { ProductSpecPreset } from '../../../common/types/spec-preset.types'

export class WeldingConfigAssemblyDto {
  @ApiProperty() assembly_id: number
  @ApiProperty() assembly_mark: string
  @ApiProperty({ nullable: true }) material_id: number | null
  @ApiProperty({ nullable: true }) material_name: string | null
  @ApiProperty({ nullable: true }) fillet_mm: number | null
  @ApiProperty({ nullable: true }) sides: number | null
  @ApiProperty({ nullable: true }) weld_layers: number | null
}

export class WeldingConfigResponseDto {
  @ApiProperty() dispatch_id: number
  @ApiProperty({ type: [WeldingConfigAssemblyDto] }) assemblies: WeldingConfigAssemblyDto[]
  @ApiProperty({ description: 'Standard products with spec presets — use to pre-fill config' })
  available_presets: ProductSpecPreset[]
}

export class WeldingMbomItemDto {
  @ApiProperty() material_id: number
  @ApiProperty() material_name: string
  @ApiProperty() default_code: string
  @ApiProperty({ nullable: true }) uom: string | null
  @ApiProperty() total_path_m: number
  @ApiProperty() total_consumption_kg: number
  @ApiProperty() total_packages: number
}

export type WeldingSkipReason = 'no_length_mm' | 'profile_unparseable' | 'no_profile'

export class WeldingSkippedPartDto {
  @ApiProperty() assembly_mark: string
  @ApiProperty() part_mark: string
  @ApiProperty() reason: WeldingSkipReason
  @ApiProperty({ nullable: true }) profile: string | null
}

export class WeldingCoverageDto {
  @ApiProperty() total_parts: number
  @ApiProperty() calculated: number
  @ApiProperty() excluded_ta_f: number
  @ApiProperty() skipped: number
  @ApiProperty() coverage_pct: number
  @ApiProperty({ type: [WeldingSkippedPartDto] }) skipped_parts: WeldingSkippedPartDto[]
}

export class WeldingMbomSummaryDto {
  @ApiProperty() dispatch_id: number
  @ApiProperty({ nullable: true }) computed_at: string | null
  @ApiProperty({ type: [WeldingMbomItemDto] }) items: WeldingMbomItemDto[]
  @ApiProperty() grand_total_consumption_kg: number
  @ApiProperty() grand_total_packages: number
  @ApiProperty({ nullable: true, type: WeldingCoverageDto }) coverage: WeldingCoverageDto | null
}
