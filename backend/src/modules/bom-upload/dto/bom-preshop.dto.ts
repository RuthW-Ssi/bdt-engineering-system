import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator'
import { PreshopAssemblyDto } from '../../manufacturing-orders/dto/create-mo.dto'

// Pre-shop at the BOM page (2026-11-23) — same assembly/part shape as the MO pre-shop upload.
export class SaveBomPreshopDto {
  @ApiProperty() @IsInt() project_id: number
  @ApiProperty() @IsInt() zone_id: number
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsInt() sub_zone_id?: number | null
  @ApiProperty({ type: [PreshopAssemblyDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => PreshopAssemblyDto)
  assemblies: PreshopAssemblyDto[]
}

export class PreshopScopeQueryDto {
  @Type(() => Number) @IsInt() project_id: number
  @Type(() => Number) @IsInt() zone_id: number
  @IsOptional() @Type(() => Number) @IsInt() sub_zone_id?: number
}
