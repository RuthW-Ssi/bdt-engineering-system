import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, ValidateNested } from 'class-validator'
import { PreshopAssemblyDto } from '../../manufacturing-orders/dto/create-mo.dto'

// Pre-shop at the BOM page (2026-11-23) — same assembly/part shape as the MO pre-shop upload.
export class SaveBomPreshopDto {
  @ApiProperty() @IsInt() project_id: number
  @ApiProperty() @IsInt() zone_id: number
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsInt() sub_zone_id?: number | null
  // the revision the editor started from (null = started empty); omitted = no stale check
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsInt() base_revision?: number | null
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() overwrite?: boolean
  @ApiProperty({ required: false, enum: ['combined', 'separate'] }) @IsOptional() @IsIn(['combined', 'separate']) upload_mode?: 'combined' | 'separate'
  @ApiProperty({ type: [PreshopAssemblyDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => PreshopAssemblyDto)
  assemblies: PreshopAssemblyDto[]
}

export class PreshopScopeQueryDto {
  @Type(() => Number) @IsInt() project_id: number
  @Type(() => Number) @IsInt() zone_id: number
  @IsOptional() @Type(() => Number) @IsInt() sub_zone_id?: number
}
