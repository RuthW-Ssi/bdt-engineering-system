import { ArrayMinSize, IsInt, IsNotEmpty, IsString, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class BulkAssignOrderPartProjectCodeDto {
  @ApiProperty({ type: [Number] }) @ArrayMinSize(1) @IsInt({ each: true }) @Min(1, { each: true })
  order_part_ids!: number[]

  @ApiProperty() @IsString() @IsNotEmpty()
  project_code!: string
}
