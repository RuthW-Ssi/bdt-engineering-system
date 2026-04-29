import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CreateBindingRuleDto {
  @IsInt() @Min(1)
  priority: number

  @IsString() @IsOptional()
  description?: string

  @IsString() @IsOptional() @MaxLength(20)
  match_product_type?: string

  @IsString() @IsOptional() @MaxLength(10)
  match_mark_prefix?: string

  @IsInt() @IsOptional()
  match_categ_id?: number

  @IsString() @IsOptional() @MaxLength(60)
  match_attr_path?: string

  @IsString() @IsOptional() @MaxLength(60)
  match_attr_value?: string

  @IsInt()
  routing_template_id: number
}

export class UpdateBindingRuleDto {
  @IsInt() @IsOptional() @Min(1)
  priority?: number

  @IsString() @IsOptional()
  description?: string

  @IsBoolean() @IsOptional()
  active?: boolean

  @IsString() @IsOptional() @MaxLength(20)
  match_product_type?: string

  @IsString() @IsOptional() @MaxLength(10)
  match_mark_prefix?: string

  @IsInt() @IsOptional()
  match_categ_id?: number
}

export class ReorderBindingRulesDto {
  @IsArray()
  items: { id: number; priority: number }[]
}
