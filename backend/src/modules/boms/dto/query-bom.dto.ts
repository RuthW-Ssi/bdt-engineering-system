import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsIn, IsString, MaxLength } from 'class-validator'

export class QueryBomDto {
  @ApiPropertyOptional({ enum: ['eBOM', 'mBOM', 'sBOM'] })
  @IsOptional()
  @IsIn(['eBOM', 'mBOM', 'sBOM'])
  bom_view?: string

  @ApiPropertyOptional({ enum: ['draft', 'active', 'obsolete'] })
  @IsOptional()
  @IsIn(['draft', 'active', 'obsolete'])
  state?: string

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string
}
