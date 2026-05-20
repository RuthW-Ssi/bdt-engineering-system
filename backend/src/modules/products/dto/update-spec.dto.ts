import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, ValidateNested } from 'class-validator'
import { PaintSpecPresetDto, WeldingSpecPresetDto } from './spec-preset.dto'

export class UpdateSpecDto {
  @ApiPropertyOptional({ type: PaintSpecPresetDto, nullable: true, description: 'Replace paint spec. Pass null to clear.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaintSpecPresetDto)
  default_paint_spec?: PaintSpecPresetDto | null

  @ApiPropertyOptional({ type: WeldingSpecPresetDto, nullable: true, description: 'Replace welding spec. Pass null to clear.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeldingSpecPresetDto)
  default_welding_spec?: WeldingSpecPresetDto | null
}
