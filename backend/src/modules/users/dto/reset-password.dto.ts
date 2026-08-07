import { IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class ResetPasswordDto {
  @ApiProperty({ example: 'ChangeMe2026!' })
  @IsString()
  @MinLength(8)
  password: string
}
