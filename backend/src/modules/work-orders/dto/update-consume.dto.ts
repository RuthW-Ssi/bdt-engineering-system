import { ArrayMinSize, IsArray, IsInt, IsPositive, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * PATCH /wo/:id/consume (2026-09-17) — records the real, actual material usage
 * against a WO's already-computed planned consume (WorkOrderAutoCreateService
 * .recomputeConsume, run automatically on create/add-marks). `qty_actual` has
 * no upper bound — real consumption can exceed the plan (waste, rework, a
 * rounded-up material issue). Whole units only (2026-09-21) — shop floor
 * records consume to the nearest whole unit, not fractional kg/pcs. Each
 * entry must reference a `material_id` that already has a `work_order_consume`
 * row on this WO (enforced in the service, not here — this DTO only shapes
 * the request).
 */
export class UpdateConsumeEntryDto {
  @IsInt()
  @IsPositive()
  material_id: number

  @IsInt()
  @Min(0)
  qty_actual: number
}

export class UpdateConsumeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateConsumeEntryDto)
  consume: UpdateConsumeEntryDto[]
}
