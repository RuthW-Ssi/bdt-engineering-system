import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsIn, IsOptional, IsNumber, MaxLength } from 'class-validator'

const VALID_REVISIONS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'IFC','AB',
]

export class AddRevisionDto {
  @ApiProperty({ enum: VALID_REVISIONS, example: 'A' })
  @IsIn(VALID_REVISIONS)
  revision: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  change_summary?: string

  @ApiProperty({ example: 'https://storage.example.com/drawings/DWG-001-A.pdf' })
  @IsString()
  @MaxLength(500)
  file_url: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  file_size_bytes?: number

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  file_mime_type?: string

  @ApiPropertyOptional({ example: 'abc123...' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  file_checksum_sha256?: string
}
