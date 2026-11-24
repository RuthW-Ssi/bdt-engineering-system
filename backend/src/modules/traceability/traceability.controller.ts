import {
  Controller, Get, Post, Patch, Param, Query, Body, ParseIntPipe, UseGuards, Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { TraceabilityService } from './traceability.service'
import { AssignHeatDto, BulkAssignHeatDto, VoidPlateCutDto } from './dto/assign-heat.dto'
import { QueryHeatLotDto, UpsertHeatLotDto } from './dto/heat-lot.dto'
import { BackwardQueryDto, ForwardQueryDto, QueryProjectTraceDto } from './dto/query-trace.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'

// Gated by the existing `cutting-plan` permission module: traceability is entered on
// cutting-plan sheets, and a new module key would need grants for every user first.
@ApiTags('traceability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('traceability')
export class TraceabilityController {
  constructor(private readonly svc: TraceabilityService) {}

  // ── Heat lots ──
  @Get('heat-lots')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'List heat lots (newest first), optional text search' })
  async listHeatLots(@Query() query: QueryHeatLotDto) {
    return this.svc.listHeatLots(query)
  }

  @Post('heat-lots')
  @RequiresPermission('cutting-plan', 'update')
  @ApiOperation({ summary: 'Create a heat lot, or update it when (heat_no, mill) already exists' })
  async upsertHeatLot(@Body() dto: UpsertHeatLotDto, @CurrentUser() user: JwtPayload) {
    return this.svc.upsertHeatLot(dto, user.sub)
  }

  // ── Sheets ──
  @Get('uploads/:uploadId/sheets')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Every nesting sheet of one cutting plan upload with its current heat assignment(s)' })
  async sheetsOfUpload(@Param('uploadId', ParseIntPipe) uploadId: number) {
    return this.svc.sheetsOfUpload(uploadId)
  }

  @Post('sheets/:nestingId/assign')
  @RequiresPermission('cutting-plan', 'update')
  @ApiOperation({ summary: 'Assign a heat number / plate to a nesting sheet and pass it on to every part on that sheet' })
  async assign(@Param('nestingId', ParseIntPipe) nestingId: number, @Body() dto: AssignHeatDto, @CurrentUser() user: JwtPayload) {
    return this.svc.assignHeatToSheet(nestingId, dto, user.sub)
  }

  @Post('sheets/assign-bulk')
  @RequiresPermission('cutting-plan', 'update')
  @ApiOperation({ summary: 'Assign one heat number to several nesting sheets; each sheet is its own transaction and reports its own result' })
  async assignBulk(@Body() dto: BulkAssignHeatDto, @CurrentUser() user: JwtPayload) {
    return this.svc.assignHeatToSheets(dto, user.sub)
  }

  @Get('sheets/:nestingId/history')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Audit trail of a sheet: every heat assignment ever made on it (ACTIVE and VOID, who, when, void reason)' })
  async sheetHistory(@Param('nestingId', ParseIntPipe) nestingId: number) {
    return this.svc.sheetHistory(nestingId)
  }

  @Patch('plate-cuts/:id/void')
  @RequiresPermission('cutting-plan', 'update')
  @ApiOperation({ summary: 'Void a wrong assignment (kept for history, no longer counted)' })
  async voidPlateCut(@Param('id', ParseIntPipe) id: number, @Body() dto: VoidPlateCutDto, @CurrentUser() user: JwtPayload) {
    return this.svc.voidPlateCut(id, dto.reason, user.sub)
  }

  // ── Queries ──
  @Get('forward')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Forward: heat number → plates cut → parts' })
  async forward(@Query() query: ForwardQueryDto) {
    return this.svc.forward(query.heat_no, query.mill)
  }

  @Get('forward/export.csv')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Forward result as CSV (UTF-8 with BOM): every part cut from the heat, one line per part × plate' })
  async forwardCsv(@Query() query: ForwardQueryDto, @Res() res: Response) {
    const { fileName, csv } = await this.svc.forwardCsv(query.heat_no, query.mill)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(csv)
  }

  @Get('backward')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Backward: part mark → plates → heat numbers' })
  async backward(@Query() query: BackwardQueryDto) {
    return this.svc.backward(query.part_mark, query.project_code)
  }

  // ── Per project ──
  @Get('projects/:projectId/completeness')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Share of the nested (main) parts of a project that have a heat number' })
  async completeness(@Param('projectId', ParseIntPipe) projectId: number, @Query() query: QueryProjectTraceDto) {
    return this.svc.projectCompleteness(projectId, query.scope)
  }

  @Get('projects/:projectId/parts')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Nested parts of a project with plate / heat; untraced=true lists only the missing ones' })
  async parts(@Param('projectId', ParseIntPipe) projectId: number, @Query() query: QueryProjectTraceDto) {
    return this.svc.projectParts(projectId, query)
  }

  @Get('projects/:projectId/export.csv')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'The same list as CSV (UTF-8 with BOM), one line per part × plate' })
  async exportCsv(@Param('projectId', ParseIntPipe) projectId: number, @Query() query: QueryProjectTraceDto, @Res() res: Response) {
    const { fileName, csv } = await this.svc.projectCsv(projectId, query)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(csv)
  }
}
