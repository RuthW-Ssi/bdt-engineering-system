import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'

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

  @IsString() @IsOptional() @MaxLength(500)
  bg_image_url?: string

  @IsNumber() @IsOptional()
  bg_rotation?: number

  @IsNumber() @IsOptional()
  bg_scale?: number

  @IsArray() @IsOptional()
  canvas_edges?: unknown[]
}

export class UpdateRoutingTemplateDto {
  @IsString() @IsOptional() @MaxLength(60)
  name?: string

  @IsString() @IsOptional()
  description?: string

  @IsBoolean() @IsOptional()
  active?: boolean

  @IsString() @IsOptional() @MaxLength(500)
  bg_image_url?: string

  @IsNumber() @IsOptional()
  bg_rotation?: number

  @IsNumber() @IsOptional()
  bg_scale?: number

  @IsArray() @IsOptional()
  canvas_edges?: unknown[]
}
