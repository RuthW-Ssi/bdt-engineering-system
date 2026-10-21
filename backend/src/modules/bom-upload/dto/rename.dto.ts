import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Length, ValidateNested } from 'class-validator'

export class RenamePairItemDto {
  @ApiProperty({ enum: ['ASSEMBLY', 'PART'] }) @IsIn(['ASSEMBLY', 'PART']) kind: 'ASSEMBLY' | 'PART'
  @ApiProperty() @IsString() @Length(1, 100) from_mark: string
  @ApiProperty() @IsString() @Length(1, 100) to_mark: string
  @ApiProperty({ enum: ['old', 'new'], required: false }) @IsOptional() @IsIn(['old', 'new']) keep?: 'old' | 'new'
}

export class SaveRenamesDto {
  @ApiProperty({ type: [RenamePairItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => RenamePairItemDto)
  renames: RenamePairItemDto[]
}
