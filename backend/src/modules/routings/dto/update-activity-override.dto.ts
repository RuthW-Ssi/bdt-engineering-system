import { IsArray, IsInt, IsNumber, IsOptional, Min } from 'class-validator'

export class UpdateActivityOverrideDto {
  @IsNumber() @IsOptional() @Min(0)
  per_minute_override?: number | null

  @IsNumber() @IsOptional() @Min(0)
  std_measure_override?: number | null

  @IsNumber() @IsOptional() @Min(0)
  manpower_override?: number | null
}

export class AddStepActivityDto {
  @IsInt()
  activity_template_id: number

  @IsInt() @IsOptional() @Min(1)
  sequence?: number
}

export class BulkAddStepActivitiesDto {
  @IsArray()
  @IsInt({ each: true })
  activity_template_ids: number[]
}
