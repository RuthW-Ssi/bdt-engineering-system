import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export const DOCUMENT_AUDIENCES = ['employee', 'customer', 'all'] as const
export type DocumentAudience = (typeof DOCUMENT_AUDIENCES)[number]

// Multipart form fields — every value arrives as a string.
export class CreateDocumentDto {
  @ApiProperty({ example: 'คู่มือระบบ BDT — งานผลิต' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string

  @ApiProperty({ example: 'v1' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  version: string

  @ApiPropertyOptional({ example: 'user-manual' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string

  @ApiPropertyOptional({ enum: DOCUMENT_AUDIENCES })
  @IsOptional()
  @IsIn(DOCUMENT_AUDIENCES)
  audience?: DocumentAudience

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string
}

export class UpdateDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  version?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string

  @ApiPropertyOptional({ enum: DOCUMENT_AUDIENCES })
  @IsOptional()
  @IsIn(DOCUMENT_AUDIENCES)
  audience?: DocumentAudience

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string
}
