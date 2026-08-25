import { IsInt, IsOptional, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

// Mirrors bom-upload.service.ts's getLatestRevision(projectId, zoneId,
// subZoneId) shape — scoped by zone(+sub-zone), not project, since
// 2026-08-25's Zone rescope.
export class QueryLatestDrawingVersionDto {
  @ApiPropertyOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  zone_id!: number

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1)
  sub_zone_id?: number
}
