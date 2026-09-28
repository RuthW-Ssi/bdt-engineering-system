import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsInt, IsISO8601, IsOptional, IsPositive, IsNumber, IsString, MaxLength, Min, ValidateNested } from 'class-validator'

/**
 * POST /mo/:id/work-orders (multi-mark redesign, 2026-09-17) — replaces the old
 * auto-create-on-confirm flow (now fully manual, no endpoint body at all back then).
 * ALWAYS creates a brand-new WO for (mo_id, operation_id) — an operation can have
 * several WOs at once (2026-09-23, e.g. split across teams), but there is no way to
 * add marks to an already-created one ("สร้าง wo แล้วไม่ควรเพิ่ม mark ทีหลังได้" —
 * a WO's mark set is fixed at creation, same as its team/plan dates). See
 * WorkOrderAutoCreateService.createOrAddMarks().
 *
 * `qty` is user-specified per mark, not auto-copied from mo_assembly_line.qty — a WO
 * may plan fewer pieces of a mark than the MO's total for it (2026-09-17 revision,
 * caught in manual testing: the picker only let the user choose WHICH marks, not HOW
 * MANY of each). Capped server-side at what's actually left to plan for THIS
 * operation: the mark's own mo_assembly_line.qty MINUS whatever's already
 * qty_planned on sibling WOs of the same operation (2026-09-23 bug fix — the
 * multi-WO-per-operation feature allows a mark to be shared across an operation's
 * WOs, e.g. split across teams, but the sum across them must never exceed the MO's
 * real qty for it; see WorkOrderAutoCreateService.computeMarkBudget()).
 *
 * `parts`/`consume` (2026-09-17, single-page form revision) are OPTIONAL overrides on
 * top of the auto-computed suggestions `recomputeParts()`/`recomputeConsume()` would
 * otherwise leave as-is — the frontend previews those suggestions
 * (`POST /mo/:id/work-orders/preview`) before the user ever presses Create, so the
 * single Create action can carry marks + confirmed/edited part weights + confirmed/
 * edited consume actuals all together, per the approved single-page design (see
 * [[project_multi_mark_wo_design]] follow-up notes — this replaced an earlier 2-step
 * "create, then review" flow the user rejected).
 */
export class CreateWoMarkDto {
  @IsInt()
  @IsPositive()
  assembly_line_id: number

  @IsNumber()
  @IsPositive()
  qty: number
}

export class CreateWoPartOverrideDto {
  @IsInt()
  @IsPositive()
  bom_assembly_part_id: number

  @IsNumber()
  @Min(0)
  qty: number
}

export class CreateWoConsumeOverrideDto {
  @IsInt()
  @IsPositive()
  material_id: number

  // Whole units only (2026-09-21) — shop floor records consume to the
  // nearest whole unit, not fractional kg/pcs.
  @IsInt()
  @Min(0)
  qty_actual: number
}

export class CreateWoDto {
  @IsInt()
  @IsPositive()
  operation_id: number

  // Plain free-text record of which team this WO is issued to (2026-09-21).
  // Superseded by team_id below (2026-09-22) for anything using the Create WO
  // form's Team dropdown — kept for API completeness/back-compat only.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assigned_to?: string

  // Structured "which team is this WO issued to" (2026-09-22) — FK to the
  // `team` table (Machine & Resources → Operator → Team). Required
  // (2026-09-25 — user: "ต้องให้ team และ plan start finish ต้องกรอกตลอด").
  @IsInt()
  @IsPositive()
  team_id: number

  // Planned production window — date+time, since a WO's schedule is
  // meaningful to the minute. Field names match manufacturing_order's
  // plan_start/plan_finish exactly (2026-09-22). Required (2026-09-25).
  @IsISO8601()
  plan_start: string

  @IsISO8601()
  plan_finish: string

  // How many people from `team` are on this WO — internal: auto-counted
  // from active operators on the team (frontend), still editable, capped at
  // the team's active-operator count; external: entered manually (no
  // operators to count, no cap). Required, min 1 (2026-09-25).
  @IsInt()
  @Min(1)
  team_headcount: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateWoMarkDto)
  marks: CreateWoMarkDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWoPartOverrideDto)
  parts?: CreateWoPartOverrideDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWoConsumeOverrideDto)
  consume?: CreateWoConsumeOverrideDto[]
}

/** Body for POST /mo/:id/work-orders/preview — same selection shape as CreateWoDto's marks. */
export class PreviewWoDto {
  @IsInt()
  @IsPositive()
  operation_id: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateWoMarkDto)
  marks: CreateWoMarkDto[]
}
