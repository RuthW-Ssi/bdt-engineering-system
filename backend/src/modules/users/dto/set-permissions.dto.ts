import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class PermissionEntryDto {
  @ApiProperty({ example: 'boms' })
  @IsString()
  module: string

  @ApiProperty({ example: true, description: 'Removing view blocks the feature entirely — no implicit read-all' })
  @IsBoolean()
  can_view: boolean

  @ApiProperty({ example: true })
  @IsBoolean()
  can_create: boolean

  @ApiProperty({ example: true })
  @IsBoolean()
  can_update: boolean

  @ApiProperty({ example: false })
  @IsBoolean()
  can_delete: boolean
}

export class SetPermissionsDto {
  @ApiProperty({ type: [PermissionEntryDto], description: 'Full replacement set — omit a module to revoke all actions for it' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  permissions: PermissionEntryDto[]
}
