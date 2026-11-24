import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../../common/guards/permission.guard'
import { RequiresPermission } from '../../../common/decorators/permission.decorator'
import { parsePrintLang } from '../mo-print/mo-print-labels'
import { JobSheetService, type JobSheetScope, type ZoneJobSheetScope } from './job-sheet.service'
import { parseIdList, parseJobSheetMode, parseMarkList, parseOptionalId } from './job-sheet-format'

// A repeated query key (?mode=a&mode=b) arrives as an array — treat anything
// that is not a single string as "not given" instead of crashing on .split().
const one = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

// List filters (wo_ids, marks) may legitimately arrive repeated
// (?wo_ids=1&wo_ids=2) — join them instead of dropping the filter, which
// would silently widen the batch to the whole MO / zone.
const list = (v: unknown): string | undefined =>
  Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string') ? v.join(',') : one(v)

// Per-piece job sheets ("ใบงานต่อชิ้น"). Own controller on the same
// `mo` prefix so the 400-line MO controller stays untouched; it uses the same
// guards and the same `orders:view` permission as the print packet. Query params are read one by one and parsed by
// the pure helpers in job-sheet-format.ts, as GET :id/print-packet does.
@ApiTags('Manufacturing Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('mo')
export class JobSheetController {
  constructor(private readonly jobSheets: JobSheetService) {}

  // Zone batch — all CONFIRMED / IN_PROGRESS MOs with work in the zone, one
  // PDF. Literal `job-sheets/zone/...` segments, so no clash with `:id/...`.
  @Get('job-sheets/zone/:zoneId/preview')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Per-piece job sheets for a whole zone (every CONFIRMED / IN_PROGRESS MO with work in it) — JSON preview. 404 ZONE_NOT_FOUND; 409 JOB_SHEET_EMPTY / JOB_SHEET_TOO_MANY / JOB_SHEET_TOO_MANY_MOS.' })
  @ApiQuery({ name: 'sub_zone_id', required: false })
  @ApiQuery({ name: 'assembly_marks', required: false })
  @ApiQuery({ name: 'part_marks', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['piece', 'part'] })
  previewZone(
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @Query('sub_zone_id') subZoneId: unknown,
    @Query('assembly_marks') assemblyMarks: unknown,
    @Query('part_marks') partMarks: unknown,
    @Query('mode') mode: unknown,
  ) {
    return this.jobSheets.previewZone(zoneId, zoneScopeOf(subZoneId, assemblyMarks, partMarks, mode))
  }

  @Get('job-sheets/zone/:zoneId')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Per-piece job sheets for a whole zone — application/pdf. Same query as the zone /preview plus lang.' })
  @ApiQuery({ name: 'sub_zone_id', required: false })
  @ApiQuery({ name: 'assembly_marks', required: false })
  @ApiQuery({ name: 'part_marks', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['piece', 'part'] })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'th'] })
  async zonePdf(
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @Query('sub_zone_id') subZoneId: unknown,
    @Query('assembly_marks') assemblyMarks: unknown,
    @Query('part_marks') partMarks: unknown,
    @Query('mode') mode: unknown,
    @Query('lang') lang: unknown,
    @Res() res: Response,
  ) {
    const bytes = await this.jobSheets.buildZonePdf(zoneId, zoneScopeOf(subZoneId, assemblyMarks, partMarks, mode), parsePrintLang(one(lang)))
    res.set({ 'Content-Type': 'application/pdf' })
    res.send(Buffer.from(bytes))
  }

  @Get(':id/job-sheets/preview')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Per-piece job sheets — JSON preview of the batch (what would print, with totals). 409 JOB_SHEET_EMPTY / JOB_SHEET_TOO_MANY.' })
  @ApiQuery({ name: 'wo_ids', required: false, description: 'Comma-separated WO ids — only assemblies on these WOs. Omitted = whole MO.' })
  @ApiQuery({ name: 'zone_id', required: false, description: 'Only assemblies dispatched to this zone.' })
  @ApiQuery({ name: 'sub_zone_id', required: false })
  @ApiQuery({ name: 'assembly_marks', required: false, description: 'Comma-separated assembly marks.' })
  @ApiQuery({ name: 'part_marks', required: false, description: 'Comma-separated part marks.' })
  @ApiQuery({ name: 'mode', required: false, enum: ['piece', 'part'], description: 'piece = one sheet per physical piece (default); part = one sheet per part mark with its quantity.' })
  preview(
    @Param('id', ParseIntPipe) id: number,
    @Query('wo_ids') woIds: unknown,
    @Query('zone_id') zoneId: unknown,
    @Query('sub_zone_id') subZoneId: unknown,
    @Query('assembly_marks') assemblyMarks: unknown,
    @Query('part_marks') partMarks: unknown,
    @Query('mode') mode: unknown,
  ) {
    return this.jobSheets.preview(id, scopeOf(woIds, zoneId, subZoneId, assemblyMarks, partMarks, mode))
  }

  // `@Res()` (not passthrough) for the same reason as GET :id/print-packet:
  // Nest would JSON-serialize a Buffer. Exceptions still reach the filters.
  @Get(':id/job-sheets')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Per-piece job sheets — application/pdf, one A4 page per piece (or per part mark). Same query as /preview plus lang.' })
  @ApiQuery({ name: 'wo_ids', required: false })
  @ApiQuery({ name: 'zone_id', required: false })
  @ApiQuery({ name: 'sub_zone_id', required: false })
  @ApiQuery({ name: 'assembly_marks', required: false })
  @ApiQuery({ name: 'part_marks', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['piece', 'part'] })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'th'], description: 'Language of the printed form labels. Omitted/anything else = en.' })
  async pdf(
    @Param('id', ParseIntPipe) id: number,
    @Query('wo_ids') woIds: unknown,
    @Query('zone_id') zoneId: unknown,
    @Query('sub_zone_id') subZoneId: unknown,
    @Query('assembly_marks') assemblyMarks: unknown,
    @Query('part_marks') partMarks: unknown,
    @Query('mode') mode: unknown,
    @Query('lang') lang: unknown,
    @Res() res: Response,
  ) {
    const bytes = await this.jobSheets.buildPdf(id, scopeOf(woIds, zoneId, subZoneId, assemblyMarks, partMarks, mode), parsePrintLang(one(lang)))
    res.set({ 'Content-Type': 'application/pdf' })
    res.send(Buffer.from(bytes))
  }
}

function scopeOf(woIds: unknown, zoneId: unknown, subZoneId: unknown, assemblyMarks: unknown, partMarks: unknown, mode: unknown): JobSheetScope {
  return {
    woIds: parseIdList(list(woIds)),
    zoneId: parseOptionalId(one(zoneId)),
    subZoneId: parseOptionalId(one(subZoneId)),
    assemblyMarks: parseMarkList(list(assemblyMarks)),
    partMarks: parseMarkList(list(partMarks)),
    mode: parseJobSheetMode(one(mode)),
  }
}

function zoneScopeOf(subZoneId: unknown, assemblyMarks: unknown, partMarks: unknown, mode: unknown): ZoneJobSheetScope {
  return {
    subZoneId: parseOptionalId(one(subZoneId)),
    assemblyMarks: parseMarkList(list(assemblyMarks)),
    partMarks: parseMarkList(list(partMarks)),
    mode: parseJobSheetMode(one(mode)),
  }
}
