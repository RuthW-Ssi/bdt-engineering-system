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

  // .pdf-only as of 2026-09-15 — .dwg upload (and the Autodesk APS 2D-preview
  // push it used to trigger) was removed entirely, not just hidden from the
  // upload modal's dropzone; this is the server-side backstop so a direct
  // API call can't slip one past that UI restriction. See
  // wiki/features/drawing.md's "DWG removed entirely" entry.
  @ApiProperty({ example: 'plan-A.pdf' })
  @IsString()
  @Matches(/\.pdf$/i, { message: 'file_name must end in .pdf — .dwg upload was removed 2026-09-15' })
  file_name: string

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mime_type?: string
}
