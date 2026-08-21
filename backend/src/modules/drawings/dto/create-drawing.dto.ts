import { IsInt, IsString, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateDrawingDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  product_id: number

  @ApiProperty({ example: 'drawings/3f9c1a-plan-A.pdf' })
  @IsString()
  file_key: string

  @ApiProperty({ example: 'plan-A.pdf' })
  @IsString()
  file_name: string

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mime_type?: string
}
