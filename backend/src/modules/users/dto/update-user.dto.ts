import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Department — free text; "admin" is the reserved bypass-all value' })
  @IsOptional()
  @IsString()
  role?: string

  @ApiPropertyOptional({ description: 'Org level — descriptive only, no permission effect' })
  @IsOptional()
  @IsString()
  level?: string

  @ApiPropertyOptional({ description: 'Job title — descriptive only, no permission effect' })
  @IsOptional()
  @IsString()
  job_title?: string

  @ApiPropertyOptional({ enum: ['employee', 'customer'], default: 'employee' })
  @IsOptional()
  @IsIn(['employee', 'customer'])
  user_type?: 'employee' | 'customer'

  @ApiPropertyOptional({ description: 'Customer company (res_partner.id) — required when user_type = "customer"' })
  @IsOptional()
  @IsInt()
  partner_id?: number | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}
