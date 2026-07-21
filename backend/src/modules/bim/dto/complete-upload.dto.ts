import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CompleteUploadDto {
  @ApiProperty() @Transform(({ value }) => Number(value)) @IsInt()
  project_id!: number

  @ApiProperty() @IsString() @IsNotEmpty()
  filename!: string

  @ApiProperty() @IsString() @IsNotEmpty()
  object_key!: string

  @ApiProperty() @IsString() @IsNotEmpty()
  upload_key!: string

  @ApiPropertyOptional() @IsOptional() @IsIn(['minor', 'major'])
  version_choice?: 'minor' | 'major'
}
