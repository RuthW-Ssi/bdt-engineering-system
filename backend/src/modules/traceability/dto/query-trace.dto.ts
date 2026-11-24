import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { COMPLETENESS_SCOPES, CompletenessScope } from '../traceability.logic'

export class QueryProjectTraceDto {
  @ApiPropertyOptional({ enum: COMPLETENESS_SCOPES, description: 'defaults to main_or_unknown' }) @IsOptional() @IsIn(COMPLETENESS_SCOPES)
  scope?: CompletenessScope

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'only parts with no heat number yet' }) @IsOptional() @IsIn(['true', 'false'])
  untraced?: 'true' | 'false'

  @ApiPropertyOptional({ description: 'part of a part mark, sheet or heat number' }) @IsOptional() @IsString() @MaxLength(100)
  search?: string
}

export class ForwardQueryDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(60)
  heat_no!: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  mill?: string
}

export class BackwardQueryDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100)
  part_mark!: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  project_code?: string
}
