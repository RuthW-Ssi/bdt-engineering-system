import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  login: string

  @ApiProperty({ example: 'BdtDev2026!' })
  @IsString()
  @MinLength(6)
  password: string
}
