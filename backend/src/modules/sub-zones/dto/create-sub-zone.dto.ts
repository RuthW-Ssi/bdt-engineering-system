import { IsString, IsOptional, IsInt } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSubZoneDto {
  @ApiProperty({ example: 'Bay A' })
  @IsString()
  name: string

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  code?: string
}
