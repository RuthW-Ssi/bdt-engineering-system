import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsIn, MaxLength, MinLength, Matches } from 'class-validator'

const CATEGORIES = ['assembly', 'member', 'plate_part', 'sub_component', 'other'] as const
export type PrefixCategory = typeof CATEGORIES[number]

export class CreateLibraryDto {
  @ApiProperty({ example: 'H300X300X12X12', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string

  @ApiProperty({ example: 'HB', description: 'Mark prefix code — uppercase letters/digits only', maxLength: 10 })
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, { message: 'mark_prefix must be uppercase letters and digits only' })
  mark_prefix: string

  @ApiProperty({ example: 'H-Beam Column', maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  mark_prefix_label: string

  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES, { message: 'mark_prefix_category must be one of: assembly, member, plate_part, sub_component, other' })
  mark_prefix_category: PrefixCategory
}
