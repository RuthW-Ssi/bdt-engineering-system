import { IsString, MaxLength, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

// Self-service password change (2026-09-29). Same 8-char minimum as the
// admin reset (users/dto/reset-password.dto.ts); 128 max bounds bcrypt work.
export class ChangePasswordDto {
  @ApiProperty({ example: 'Old-pass-1' })
  @IsString()
  @MaxLength(128)
  current_password: string

  @ApiProperty({ example: 'New-pass-22' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string
}
