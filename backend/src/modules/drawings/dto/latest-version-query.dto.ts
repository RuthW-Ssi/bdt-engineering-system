import { IsIn } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { QueryDrawingDto } from './query-drawing.dto'

export class LatestVersionQueryDto extends QueryDrawingDto {
  @ApiProperty({ enum: ['dwg', 'pdf'] })
  @IsIn(['dwg', 'pdf'])
  file_type!: 'dwg' | 'pdf'
}
