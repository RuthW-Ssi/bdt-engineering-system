import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class UpsertOverrideDto {
  @IsNumber() @IsOptional() @Min(0)
  override_per_minute?: number | null

  @IsNumber() @IsOptional() @Min(0)
  override_std_measure?: number | null

  @IsNumber() @IsOptional() @Min(0)
  override_manpower?: number | null

  @IsInt() @IsOptional()
  override_workcenter_id?: number | null

  @IsString() @IsOptional()
  reason?: string

  @IsInt() @IsOptional()
  eco_id?: number
}
