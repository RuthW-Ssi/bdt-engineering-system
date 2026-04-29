import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateRoutingTemplateDto {
  @IsString() @MaxLength(20)
  code: string

  @IsString() @MaxLength(60)
  name: string

  @IsString() @IsOptional() @MaxLength(20)
  applies_to_product_type?: string

  @IsInt() @IsOptional()
  applies_to_categ_id?: number

  @IsBoolean() @IsOptional()
  active?: boolean
}

export class UpdateRoutingTemplateDto {
  @IsString() @IsOptional() @MaxLength(60)
  name?: string

  @IsString() @IsOptional()
  description?: string

  @IsBoolean() @IsOptional()
  active?: boolean
}
