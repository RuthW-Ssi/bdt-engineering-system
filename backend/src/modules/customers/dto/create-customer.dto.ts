import { IsString, IsOptional, IsEmail, Matches, MaxLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateCustomerDto {
  @ApiProperty({ example: 'ABC-001' })
  @IsOptional()
  @IsString()
  ref?: string

  @ApiProperty({ example: 'ABC Steel Co., Ltd.' })
  @IsString()
  name: string

  @ApiPropertyOptional({ example: 'ABC Steel' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  short_name?: string

  @ApiPropertyOptional({ example: '0105551234567', description: 'Thai tax ID (13 digits)' })
  @IsOptional()
  @Matches(/^\d{13}$/, { message: 'Tax ID must be exactly 13 digits' })
  tax_id?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string
}
