import { IsISO8601 } from 'class-validator'

/** PATCH /mo/:id/actual-dates — DONE MOs only (service returns 409 otherwise). */
export class UpdateMoActualDatesDto {
  @IsISO8601()
  actual_start: string

  @IsISO8601()
  actual_finish: string
}
