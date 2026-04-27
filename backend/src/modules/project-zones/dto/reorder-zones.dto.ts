import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsInt } from 'class-validator'

export class ReorderZonesDto {
  @ApiProperty({ description: 'Ordered list of zone IDs', example: [3, 1, 2] })
  @IsArray()
  @IsInt({ each: true })
  sequence: number[]
}
