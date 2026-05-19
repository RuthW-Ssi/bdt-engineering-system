import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator'

export class WeldingConfigRowDto {
  @ApiProperty() @IsInt() assembly_id: number
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsInt() material_id?: number | null
  @ApiProperty({ required: false, description: 'Weld leg size mm (default 6)' }) @IsOptional() @IsNumber() @Min(1) fillet_mm?: number
  @ApiProperty({ required: false, description: 'Number of sides to weld (1 or 2)' }) @IsOptional() @IsInt() @Min(1) sides?: number
  @ApiProperty({ required: false, description: 'Number of weld passes' }) @IsOptional() @IsInt() @Min(1) weld_layers?: number
}

export class SaveWeldingConfigDto {
  @ApiProperty({ type: [WeldingConfigRowDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => WeldingConfigRowDto)
  configs: WeldingConfigRowDto[]
}
