import { ArrayMaxSize, ArrayMinSize, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// Assign a heat number (and optionally the plate's own id) to one nesting sheet.
export class AssignHeatDto {
  @ApiProperty({ description: 'Heat number as on the mill test certificate' }) @IsString() @IsNotEmpty() @MaxLength(60)
  heat_no!: string

  @ApiPropertyOptional({ description: 'Mill name — heat numbers are only unique per mill' }) @IsOptional() @IsString() @MaxLength(120)
  mill?: string

  @ApiPropertyOptional({ description: 'Mill test certificate number' }) @IsOptional() @IsString() @MaxLength(100)
  cert_no?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  supplier?: string

  @ApiPropertyOptional({ description: "The plate's own id as stamped / labelled" }) @IsOptional() @IsString() @MaxLength(60)
  plate_no?: string

  @ApiPropertyOptional({ description: 'Which plate of the sheet when one nest is cut on several plates (default 1)' })
  @IsOptional() @IsInt() @Min(1) @Max(999)
  plate_seq?: number

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @IsOptional() @IsDateString()
  cut_date?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60)
  machine?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  note?: string

  @ApiPropertyOptional({ description: 'Why an earlier assignment of this plate is replaced' }) @IsOptional() @IsString() @MaxLength(300)
  reason?: string
}

// The same heat number for several sheets at once (plates of one heat cut in a row).
export class BulkAssignHeatDto extends AssignHeatDto {
  @ApiProperty({ type: [Number] }) @ArrayMinSize(1) @ArrayMaxSize(200) @IsInt({ each: true }) @Min(1, { each: true })
  nesting_ids!: number[]
}

export class VoidPlateCutDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300)
  reason!: string
}
