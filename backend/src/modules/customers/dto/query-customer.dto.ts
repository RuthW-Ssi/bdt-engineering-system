import { IsOptional, IsString, IsBooleanString, IsNumberString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class QueryCustomerDto {
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
