import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class CreateLibraryDto {
  @ApiProperty({ example: 'H300x300x12x12', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string
}
