import { IsInt, IsString, IsOptional, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateDrawingDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  project_id: number

  @ApiProperty({ example: 7 })
  @IsInt()
  zone_id: number

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  sub_zone_id?: number

  @ApiProperty({ example: 1 })
  @IsInt()
  version: number

  @ApiProperty({ example: 'drawings/0X220/Z1/v1/plan-A.pdf' })
  @IsString()
  @Matches(/^drawings\/[^/\\]+\/[^/\\]+\/(?:[^/\\]+\/)?v\d+\/[^/\\]+$/, {
    message: 'file_key must be drawings/<project_code>/<zone_code>/[<subzone_code>/]v<version>/<filename>, no other path segments',
  })
  file_key: string

  @ApiProperty({ example: 'plan-A.pdf' })
  @IsString()
  file_name: string

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mime_type?: string
}
