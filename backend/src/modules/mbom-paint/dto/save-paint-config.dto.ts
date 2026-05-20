import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, Min, ValidateNested } from 'class-validator'

export class PaintConfigRowDto {
  @ApiProperty() @IsInt() assembly_id: number
  @ApiProperty({ enum: ['primer', 'intermediate', 'fireproof', 'topcoat'] })
  @IsIn(['primer', 'intermediate', 'fireproof', 'topcoat']) paint_type: string
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsInt() material_id?: number | null
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) layers: number
}

export class SavePaintConfigDto {
  @ApiProperty({ type: [PaintConfigRowDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaintConfigRowDto)
  configs: PaintConfigRowDto[]
}
