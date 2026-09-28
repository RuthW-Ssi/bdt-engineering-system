import { ArrayMinSize, IsArray, IsInt, IsNumber, IsPositive, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * PATCH /wo/:id/parts (2026-09-17, qty-primary 2026-09-21) — sets the
 * withdrawal qty (pieces) for a part against a WO. Unlike /consume, there's
 * no plan/actual split for parts — `qty` is simply whatever value the caller
 * sends (recomputeParts only ever writes an initial suggestion; this
 * endpoint is the only way to change it afterwards); `weight_kg` is derived
 * server-side from qty, never taken from the request. Capped at the mark's
 * real remaining budget in pieces (enforced in the service via
 * `computePartBudget()`). Each entry must reference a `bom_assembly_part_id`
 * that already has a `work_order_part` row on this WO (enforced in the
 * service, not here).
 */
export class UpdatePartEntryDto {
  @IsInt()
  @IsPositive()
  bom_assembly_part_id: number

  @IsNumber()
  @Min(0)
  qty: number
}

export class UpdatePartsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePartEntryDto)
  parts: UpdatePartEntryDto[]
}
