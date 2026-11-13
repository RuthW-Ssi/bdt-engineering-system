import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// CP-Shape-Test: one size per request. Limits keep one solve small (knapsack memory grows with stock length × part types).
export const MAX_STOCK_MM = 15000
export const MAX_PART_TYPES = 300 // distinct lengths per size (the optimizer works on lengths, not marks)
export const MAX_MARKS = 5000 // several BOM zones together carry many marks of the same lengths
export const MAX_PIECES = 20000

export class ShapeTestStockDto {
  @ApiProperty() @IsNumber() @Min(100) @Max(MAX_STOCK_MM) lengthMm!: number
  @ApiPropertyOptional({ description: 'empty = unlimited' }) @IsOptional() @IsInt() @Min(0) @Max(100000) qty?: number | null
}

export class ShapeTestPartDto {
  @ApiProperty() @IsString() @MaxLength(120) mark!: string
  @ApiProperty() @IsNumber() @Min(1) @Max(MAX_STOCK_MM) lengthMm!: number
  @ApiProperty() @IsInt() @Min(1) @Max(MAX_PIECES) count!: number
}

export class OptimizeShapeDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(20) kerfMm!: number
  @ApiProperty({ type: [ShapeTestPartDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_MARKS) @ValidateNested({ each: true }) @Type(() => ShapeTestPartDto) parts!: ShapeTestPartDto[]
  @ApiProperty({ type: [ShapeTestStockDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => ShapeTestStockDto) stock!: ShapeTestStockDto[]
  // POC 2026-11-12 (saddle.ts): need the project for its end cuts
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) project_id?: number
  @ApiPropertyOptional({ description: 'saddle ends tuck into each other' }) @IsOptional() @IsBoolean() saddleNest?: boolean
}

export class BomPartsDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) project_id!: number
  @ApiProperty({ type: [Number] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) zone_ids!: number[]
  @ApiPropertyOptional({ type: [String], description: 'mark groups, e.g. DBN-A3; empty = all' }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(60, { each: true }) groups?: string[]
}

export class EndCutsDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) project_id!: number
  @ApiProperty({ type: [String], description: 'part marks of one bar' }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(120, { each: true }) marks!: string[]
}
