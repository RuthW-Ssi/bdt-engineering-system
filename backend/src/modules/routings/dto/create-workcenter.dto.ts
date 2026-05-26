import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator'

export class CreateWorkcenterDto {
  @IsNotEmpty() @IsString() code: string
  @IsNotEmpty() @IsString() name: string

  @IsOptional() @IsNumber() @Min(0) sequence?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100) oee_target?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100) availability?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100) performance?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100) quality?: number
  @IsOptional() @IsObject() labor_mix?: { operator: number; skilled: number; group_head: number }
  @IsOptional() @IsNumber() @Min(0) labor_cost_per_min?: number
  @IsOptional() @IsNumber() @Min(0) electricity_cost_per_min?: number
  @IsOptional() @IsNumber() @Min(0) consumable_cost_per_min?: number
  @IsOptional() @IsNumber() @Min(0) overhead_cost_per_min?: number
}
