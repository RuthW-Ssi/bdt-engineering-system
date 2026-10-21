import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator'
import { DISPATCH_RULES, DispatchRule, SCHEDULE_DIRECTIONS, ScheduleDirection } from '../scheduler-api.client'

/**
 * POST /schedule/runs (ADR-0015). `now`, `persist` and `requested_by` are set
 * server-side by ScheduleService.run(), never taken from the browser.
 */
export class RunScheduleDto {
  @IsIn(SCHEDULE_DIRECTIONS)
  direction: ScheduleDirection

  @IsOptional()
  @IsIn(DISPATCH_RULES)
  dispatch_rule?: DispatchRule = 'EDD'

  @IsOptional()
  @IsBoolean()
  activate?: boolean = false

  /** Limit the run to these WOs (▶ Run · เลือกเอง). Omitted = every schedulable WO. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  work_order_ids?: number[]
}
