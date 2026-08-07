import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PermissionEntryDto } from './set-permissions.dto'

export class CreateUserDto {
  @ApiProperty({ example: 'somchai.d' })
  @IsString()
  login: string

  @ApiProperty({ example: 'Somchai Detail' })
  @IsString()
  name: string

  @ApiProperty({ example: 'ChangeMe2026!' })
  @IsString()
  @MinLength(8)
  password: string

  @ApiProperty({
    example: 'BTE',
    description: 'Department — free text; admin bypasses everything for the literal value "admin". Known departments seed the permission template; new ones start with an empty template.',
  })
  @IsString()
  role: string

  @ApiPropertyOptional({ example: 'Supervisor', description: 'Org level — descriptive only, no permission effect' })
  @IsOptional()
  @IsString()
  level?: string

  @ApiPropertyOptional({ example: 'Business System Developer', description: 'Job title — descriptive only, no permission effect' })
  @IsOptional()
  @IsString()
  job_title?: string

  @ApiPropertyOptional({
    type: [PermissionEntryDto],
    description: 'Initial permission rows — if omitted, the role template is used as-is',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  permissions?: PermissionEntryDto[]
}
