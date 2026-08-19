import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards, Res,
} from '@nestjs/common'
import { Response } from 'express'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProjectsService } from './projects.service'
import { ProjectProgressService, UpdateAssemblyProgressDto, BulkUpdateAssemblyProgressDto } from './project-progress.service'
import { ProgressExportService } from './progress-export.service'
import { ProgressHistoryService } from './progress-history.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { QueryProjectDto } from './dto/query-project.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly svc: ProjectsService,
    private readonly progressSvc: ProjectProgressService,
    private readonly exportSvc: ProgressExportService,
    private readonly historySvc: ProgressHistoryService,
  ) {}

  @Post()
  @RequiresPermission('projects', 'create')
  @ApiOperation({ summary: 'Create project' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @RequiresPermission('projects', 'view')
  @ApiOperation({ summary: 'List projects' })
  findAll(@Query() query: QueryProjectDto) {
    return this.svc.findAll(query)
  }

  // ── Sprint 24: Project Progress Overview ──────────────────────
  // Registered before the ':project_code' catch-alls out of caution;
  // segment counts differ so there is no actual conflict either way.

  @Get(':project_code/progress/overview')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Per-zone weighted progress rollup + project total' })
  getProgressOverview(@Param('project_code') code: string) {
    return this.progressSvc.getOverview(code)
  }

  @Get(':project_code/progress/zones/:zone_id')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Per-assembly progress rows for one zone (ACTIVE assemblies, computed pct/status)' })
  getProgressZoneRows(@Param('project_code') code: string, @Param('zone_id', ParseIntPipe) zoneId: number) {
    return this.progressSvc.getZoneRows(code, zoneId)
  }

  @Get(':project_code/progress/zones/:zone_id/bim-match')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Mark-match map (bom_assembly ↔ bim_element global_ids) for the isolate-by-status 3D view' })
  getProgressBimMatch(@Param('project_code') code: string, @Param('zone_id', ParseIntPipe) zoneId: number) {
    return this.progressSvc.getZoneBimMatch(code, zoneId)
  }

  // 'rows'/'bim-match' as literal segments here don't collide with
  // '/zones/:zone_id...' above — different path prefix, no ordering concern.
  @Get(':project_code/progress/rows')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Per-assembly progress rows across every zone of the project (Overview tab isolate-by-status)' })
  getProgressProjectRows(@Param('project_code') code: string) {
    return this.progressSvc.getProjectRows(code)
  }

  @Get(':project_code/progress/bim-match')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Mark-match map across every zone of the project (Overview tab whole-project 3D view)' })
  getProgressProjectBimMatch(@Param('project_code') code: string) {
    return this.progressSvc.getProjectBimMatch(code)
  }

  @Get(':project_code/progress/positions')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Progress grouped by BIM structural position code instead of Zone (Overview tab alternate view)' })
  getProgressPositions(@Param('project_code') code: string) {
    return this.progressSvc.getProjectPositions(code)
  }

  @Get(':project_code/progress/export')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Download an Excel snapshot of current progress data (one sheet per zone)' })
  async exportProgress(@Param('project_code') code: string, @Res() res: Response) {
    const { buffer, filename } = await this.exportSvc.exportProgress(code)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  }

  @Get(':project_code/progress/history')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'List every progress change batch (manual edit, bulk edit, import, rollback) for this project, newest first' })
  getProgressHistory(@Param('project_code') code: string) {
    return this.historySvc.listBatches(code)
  }

  @Get(':project_code/progress/history/:batch_id')
  @RequiresPermission('project-tracking', 'view')
  @ApiOperation({ summary: 'Field-level detail of one change batch' })
  getProgressHistoryBatch(@Param('project_code') code: string, @Param('batch_id', ParseIntPipe) batchId: number) {
    return this.historySvc.getBatchDetail(code, batchId)
  }

  @Post(':project_code/progress/history/:batch_id/rollback')
  @RequiresPermission('project-tracking', 'update')
  @ApiOperation({ summary: 'Revert a batch\'s changes. Without ?force=true, detects and returns conflicts (fields touched again since) instead of writing.' })
  rollbackProgressBatch(
    @Param('project_code') code: string,
    @Param('batch_id', ParseIntPipe) batchId: number,
    @Query('force') force: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historySvc.rollback(code, batchId, user.sub, force === 'true')
  }

  // Registered before ':assembly_id' below — same path prefix, and NestJS
  // matches route declarations in order, so 'bulk' must come first or it'd
  // never be reached (ParseIntPipe would 400 on the literal "bulk" first).
  @Patch(':project_code/progress/assemblies/bulk')
  @RequiresPermission('project-tracking', 'update')
  @ApiOperation({ summary: 'Apply the same progress fields to many assemblies at once (bulk row selection); pcs via set_loaded_full/set_erected_full flags resolved per-row' })
  bulkUpdateAssemblyProgress(
    @Param('project_code') code: string,
    @Body() dto: BulkUpdateAssemblyProgressDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.progressSvc.bulkUpdateAssemblyProgress(code, dto, user.sub)
  }

  @Patch(':project_code/progress/assemblies/:assembly_id')
  @RequiresPermission('project-tracking', 'update')
  @ApiOperation({ summary: 'Upsert manual phase-progress fields (10 fab stage %, transport dates/pcs, erected pcs) for one assembly' })
  updateAssemblyProgress(
    @Param('project_code') code: string,
    @Param('assembly_id', ParseIntPipe) assemblyId: number,
    @Body() dto: UpdateAssemblyProgressDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.progressSvc.updateAssemblyProgress(code, assemblyId, dto, user.sub)
  }

  @Get(':project_code')
  @RequiresPermission('projects', 'view')
  @ApiOperation({ summary: 'Get project by code' })
  findOne(@Param('project_code') code: string) {
    return this.svc.findOne(code)
  }

  @Patch(':project_code')
  @RequiresPermission('projects', 'update')
  @ApiOperation({ summary: 'Update project' })
  update(
    @Param('project_code') code: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(code, dto, user.sub)
  }

  @Post(':project_code/action_win')
  @RequiresPermission('projects', 'update')
  @ApiOperation({ summary: 'Win project: lead → won' })
  actionWin(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_win', user.sub)
  }

  @Post(':project_code/action_start_design')
  @RequiresPermission('projects', 'update')
  @ApiOperation({ summary: 'Start design: won → in_design' })
  actionStartDesign(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_start_design', user.sub)
  }

  @Post(':project_code/action_close')
  @RequiresPermission('projects', 'update')
  @ApiOperation({ summary: 'Close project' })
  actionClose(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_close', user.sub)
  }
}
