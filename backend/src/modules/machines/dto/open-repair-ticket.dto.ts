import { IsString, IsEnum, IsDateString, IsArray, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RepairSeverity } from '@prisma/client'

export class OpenRepairTicketDto {
  @ApiProperty()
  @IsString()
  reported_by: string

  @ApiProperty()
  @IsDateString()
  reported_at: string

  @ApiProperty({ enum: RepairSeverity })
  @IsEnum(RepairSeverity)
  severity: RepairSeverity

  @ApiProperty()
  @IsString()
  problem_description: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos_before?: string[]
}
