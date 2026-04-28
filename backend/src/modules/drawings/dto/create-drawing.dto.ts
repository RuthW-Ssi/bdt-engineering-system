import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsIn, IsOptional, IsInt, MaxLength } from 'class-validator'

export class CreateDrawingDto {
  @ApiProperty({ example: 'DWG-PROJ-001', description: 'Unique drawing number' })
  @IsString()
  @MaxLength(40)
  drawing_number: string

  @ApiProperty({ enum: ['master', 'project'] })
  @IsIn(['master', 'project'])
  drawing_type: string

  @ApiProperty({ example: 'PROD-001', description: 'Product code to attach drawing to' })
  @IsString()
  product_code: string

  @ApiPropertyOptional({ example: 1, description: 'Required when drawing_type=project' })
  @IsOptional()
  @IsInt()
  project_id?: number

  @ApiPropertyOptional({ enum: ['tekla', 'autocad', 'advance', 'other'], default: 'other' })
  @IsOptional()
  @IsIn(['tekla', 'autocad', 'advance', 'other'])
  cad_source?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string
}
