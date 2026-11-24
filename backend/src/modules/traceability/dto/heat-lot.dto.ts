import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class UpsertHeatLotDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(60)
  heat_no!: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  mill?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  grade?: string

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  thick_mm?: number

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  cert_no?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  supplier?: string

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @IsOptional() @IsDateString()
  received_date?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  note?: string

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  active?: boolean
}

export class QueryHeatLotDto {
  @ApiPropertyOptional({ description: 'part of the heat number, mill or certificate number' }) @IsOptional() @IsString() @MaxLength(100)
  search?: string
}
