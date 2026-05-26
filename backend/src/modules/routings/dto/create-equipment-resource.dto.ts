import { IsString, IsOptional, IsNumber, IsIn, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

const EQUIPMENT_TYPES = ['machine', 'handling', 'labor', 'tool', 'consumable'] as const

export class CreateEquipmentResourceDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,38}$/, { message: 'code must be uppercase letters, numbers, and hyphens (e.g. EQ-WELD-SAW)' })
  code: string

  @ApiProperty() @IsString() name: string

  @ApiProperty({ enum: EQUIPMENT_TYPES })
  @IsIn(EQUIPMENT_TYPES)
  type: string

  @ApiPropertyOptional() @IsOptional() @IsNumber() rate?: number
  @ApiPropertyOptional() @IsOptional() @IsString() rate_unit?: string
}
