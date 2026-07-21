import { IsNotEmpty, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class InitUploadDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  filename!: string
}
