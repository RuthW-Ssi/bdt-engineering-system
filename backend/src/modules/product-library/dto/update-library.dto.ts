import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

const CATEGORIES = ['assembly', 'member', 'plate_part', 'sub_component', 'other'] as const

export class UpdateLibraryDto {
  @ApiPropertyOptional({ example: 'H300x300x12x12-revised', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({ example: 'HB', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, { message: 'mark_prefix must be uppercase letters and digits only' })
  mark_prefix?: string

  @ApiPropertyOptional({ example: 'H-Beam Column', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  mark_prefix_label?: string

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES, { message: 'mark_prefix_category must be one of: assembly, member, plate_part, sub_component, other' })
  mark_prefix_category?: string
}
