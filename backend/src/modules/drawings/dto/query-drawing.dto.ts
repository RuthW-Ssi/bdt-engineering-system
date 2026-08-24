import { IsNumberString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class QueryDrawingDto {
  @ApiProperty({ example: '42' })
  @IsNumberString()
  project_id: string
}
