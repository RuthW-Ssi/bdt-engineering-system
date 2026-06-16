import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * PATCH /wo/:id — editable only while status = NOT_STARTED (T-WO.02).
 * All fields optional; only the supplied ones are written.
 */
export class UpdateWoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assigned_to?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsISO8601()
  earliest_start_at?: string
}
