import { IsBooleanString, IsNumberString, IsOptional, IsString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class QueryUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ default: 'true' })
  @IsOptional()
  @IsBooleanString()
  active?: string

  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string

  @ApiPropertyOptional({ default: '50' })
  @IsOptional()
  @IsNumberString()
  limit?: string
}
