import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator'
import { MoAssemblyLineInputDto } from './create-mo.dto'

/**
 * Edit a DRAFT MO only (service returns 409 otherwise). Every field optional —
 * a passed `assembly_lines` REPLACES the current set (re-validated against
 * remaining, P13); changing routing_template_id re-snapshots operations.
 */
export class UpdateMoDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  routing_template_id?: number

  @IsOptional()
  @IsISO8601()
  plan_start?: string

  @IsOptional()
  @IsISO8601()
  plan_finish?: string

  // actual_start/actual_finish removed (2026-10-01): set only via Complete
  // (PATCH /mo/:id/status) or PATCH /mo/:id/actual-dates once DONE.

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MoAssemblyLineInputDto)
  assembly_lines?: MoAssemblyLineInputDto[]
}
