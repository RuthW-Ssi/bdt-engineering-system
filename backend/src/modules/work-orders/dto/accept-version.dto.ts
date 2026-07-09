import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator'

/**
 * accept-new-version (WO BOM-Version Hold, Sprint 20).
 *
 * Both fields are structurally optional here — whether they're actually
 * required depends on the WO's current state (only knowable once the service
 * loads the WO), so that enforcement happens in `WorkOrdersService.acceptNewVersion()`,
 * not via class-validator:
 *   - `note` is required when resolving a WO out of ON_HOLD.
 *   - `qty_reusable` is required when `qty_done` exceeds the newly-adopted qty.
 */
export class AcceptVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_reusable?: number
}
