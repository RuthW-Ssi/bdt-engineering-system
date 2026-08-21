import { IsInt, IsString, IsOptional, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateDrawingDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  product_id: number

  @ApiProperty({ example: 'drawings/3f9c1a-plan-A.pdf' })
  @IsString()
  @Matches(/^drawings\/[^/\\]+$/, { message: 'file_key must be a bare filename under the drawings/ prefix, no path segments' })
  file_key: string

  @ApiProperty({ example: 'plan-A.pdf' })
  @IsString()
  file_name: string

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mime_type?: string
}
