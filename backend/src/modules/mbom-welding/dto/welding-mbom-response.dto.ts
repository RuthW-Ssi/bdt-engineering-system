import { ApiProperty } from '@nestjs/swagger'

export class WeldingConfigAssemblyDto {
  @ApiProperty() assembly_id: number
  @ApiProperty() assembly_mark: string
  @ApiProperty({ nullable: true }) material_id: number | null
  @ApiProperty({ nullable: true }) material_name: string | null
}

export class WeldingConfigResponseDto {
  @ApiProperty() dispatch_id: number
  @ApiProperty({ type: [WeldingConfigAssemblyDto] }) assemblies: WeldingConfigAssemblyDto[]
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

export class WeldingMbomSummaryDto {
  @ApiProperty() dispatch_id: number
  @ApiProperty({ nullable: true }) computed_at: string | null
  @ApiProperty({ type: [WeldingMbomItemDto] }) items: WeldingMbomItemDto[]
  @ApiProperty() grand_total_consumption_kg: number
  @ApiProperty() grand_total_packages: number
}
