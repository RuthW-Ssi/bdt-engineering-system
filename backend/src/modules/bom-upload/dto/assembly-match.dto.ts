import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, ValidateNested } from 'class-validator'

export class AssemblyMatchRowDto {
  @ApiProperty() @IsInt() assembly_id: number
  @ApiProperty({ enum: ['MATCHED_STANDARD', 'MATCHED_CUSTOM'], nullable: true, required: false })
  @IsOptional() @IsIn(['MATCHED_STANDARD', 'MATCHED_CUSTOM']) match_status?: string | null
  @ApiProperty({ nullable: true, required: false }) @IsOptional() @IsInt() product_id?: number | null
}

export class SaveAssemblyMatchDto {
  @ApiProperty({ type: [AssemblyMatchRowDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => AssemblyMatchRowDto)
  assignments: AssemblyMatchRowDto[]
}
