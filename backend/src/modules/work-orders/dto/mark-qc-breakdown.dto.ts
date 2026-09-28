import { IsNumber, IsOptional, Min } from 'class-validator'

/**
 * Disposition of a mark's already-produced output (2026-09-23, replaces the
 * single qty_reusable scalar — user: "เอา Scrapped Reusable เปลี่ยนเป็น Qc
 * passed, Rework, Renew"). Shared by remove-mark, accept-new-version, and
 * cancel (whole WO) — the three places a mark's qty_done needs breaking down
 * when its plan changes mid-stream (a mark being taken off a WO, or its BOM
 * version changing under it, or the whole WO being scrapped).
 *
 * All three fields are optional individually — class-validator can't know
 * which are required, since that depends on the target mark's CURRENT
 * qty_done, only knowable once the service loads it (enforced there, not
 * here, same as the old qty_reusable). Together they must sum to ≤ qty_done
 * — also enforced in the service.
 */
export class MarkQcBreakdownDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_qc_passed?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_rework?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_renew?: number
}
