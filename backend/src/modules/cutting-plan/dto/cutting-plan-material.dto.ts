import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// User test report 2026-11-26 — kerf settings, certificate, remnant use (Plate / Shape tabs)
export class KerfRowDto {
  @ApiProperty({ example: 'Plasma [PlainCuttingUnit]' }) @IsString() @MaxLength(60) technology!: string
  @ApiProperty() @IsNumber() @Min(0.5) @Max(200) thick_mm!: number
  @ApiPropertyOptional({ description: 'null removes the setting' }) @IsOptional() @IsNumber() @Min(0) @Max(20) kerf_mm!: number | null
}

export class SaveKerfsDto {
  @ApiProperty({ type: [KerfRowDto] }) @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => KerfRowDto) rows!: KerfRowDto[]
}

export class SetCertificateDto {
  @ApiPropertyOptional({ description: 'free text, numbers and letters; empty clears it' }) @IsOptional() @IsString() @MaxLength(100) certificate!: string | null
}

export class UseRemnantDto {
  @ApiProperty({ enum: ['PLATE', 'SHAPE'] }) @IsIn(['PLATE', 'SHAPE']) source!: 'PLATE' | 'SHAPE'
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) source_id!: number
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(10000) qty!: number
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string
}
