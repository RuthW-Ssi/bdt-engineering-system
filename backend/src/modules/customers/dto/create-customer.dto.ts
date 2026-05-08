import { IsString, IsOptional, IsEmail, IsBoolean } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateCustomerDto {
  @ApiProperty({ example: 'ABC-001' })
  @IsOptional()
  @IsString()
  ref?: string

  @ApiProperty({ example: 'ABC Steel Co., Ltd.' })
  @IsString()
  name: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vat?: string

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
