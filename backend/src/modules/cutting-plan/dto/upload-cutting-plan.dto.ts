import { Transform, Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// Multipart fields arrive as strings; an empty optional field ("") means "not picked".
const toInt = ({ value }: { value: unknown }) => (value === '' || value == null ? undefined : Number(value))

// Upload form (2026-11-06): project required; zone optional since 2026-11-10 (none = All zones); sub-zone and lot optional, no tag.
// Used as-is by the preview (multipart, .txt files only).
export class UploadCuttingPlanDto {
  @ApiProperty() @Transform(toInt) @IsInt() @Min(1)
  project_id!: number

  // omitted = All zones (whole project), 2026-11-10
  @ApiPropertyOptional() @Transform(toInt) @IsOptional() @IsInt() @Min(1)
  zone_id?: number

  @ApiPropertyOptional() @Transform(toInt) @IsOptional() @IsInt() @Min(1)
  sub_zone_id?: number

  @ApiPropertyOptional({ maxLength: 60 }) @IsOptional() @IsString() @MaxLength(60)
  lot?: string

  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500)
  description?: string

  @ApiProperty({ maxLength: 20 }) @IsString() @IsNotEmpty() @MaxLength(20)
  version!: string

  @ApiProperty({ maxLength: 20 }) @IsString() @IsNotEmpty() @MaxLength(20)
  revision!: string
}

// Preview: the names of every file picked (JSON array in a multipart field), for the
// four-files-per-plate check. Only the .txt files themselves are posted.
export class PreviewCuttingPlanDto extends UploadCuttingPlanDto {
  @ApiPropertyOptional({ description: 'JSON array of all picked file names' }) @IsOptional()
  @Transform(({ value }) => { if (typeof value !== 'string') return value; try { return JSON.parse(value) } catch { return value } })
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) @MaxLength(255, { each: true })
  file_names?: string[]
}

export class StagedFileDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500)
  upload_key!: string

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  file_name!: string
}

// Save: JSON body; the files were PUT to storage first (cutting-plan/_incoming/…), D8.
export class SaveCuttingPlanDto extends UploadCuttingPlanDto {
  @ApiProperty({ type: [StagedFileDto] }) @IsArray() @ArrayMinSize(4) @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => StagedFileDto)
  staged!: StagedFileDto[]
}

// One request for all staging URLs of an upload (D8).
export class StagingUrlsDto {
  @ApiProperty() @Transform(toInt) @IsInt() @Min(1)
  project_id!: number

  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsString({ each: true }) @IsNotEmpty({ each: true }) @MaxLength(255, { each: true })
  file_names!: string[]
}
