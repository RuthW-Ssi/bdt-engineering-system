import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator'

export class WeldingConfigRowDto {
  @ApiProperty() @IsInt() assembly_id: number
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsInt() material_id?: number | null
}

export class SaveWeldingConfigDto {
  @ApiProperty({ type: [WeldingConfigRowDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => WeldingConfigRowDto)
  configs: WeldingConfigRowDto[]
}
