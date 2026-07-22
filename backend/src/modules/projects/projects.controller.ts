import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProjectsService } from './projects.service'
import { ProjectProgressService, UpdateAssemblyProgressDto } from './project-progress.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { QueryProjectDto } from './dto/query-project.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly svc: ProjectsService,
    private readonly progressSvc: ProjectProgressService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create project' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List projects' })
  findAll(@Query() query: QueryProjectDto) {
    return this.svc.findAll(query)
  }

  // ── Sprint 24: Project Progress Overview ──────────────────────
  // Registered before the ':project_code' catch-alls out of caution;
  // segment counts differ so there is no actual conflict either way.

  @Get(':project_code/progress/overview')
  @ApiOperation({ summary: 'Per-zone weighted progress rollup + project total' })
  getProgressOverview(@Param('project_code') code: string) {
    return this.progressSvc.getOverview(code)
  }

  @Get(':project_code/progress/zones/:zone_id')
  @ApiOperation({ summary: 'Per-assembly progress rows for one zone (ACTIVE assemblies, computed pct/status)' })
  getProgressZoneRows(@Param('project_code') code: string, @Param('zone_id', ParseIntPipe) zoneId: number) {
    return this.progressSvc.getZoneRows(code, zoneId)
  }

  @Get(':project_code/progress/zones/:zone_id/bim-match')
  @ApiOperation({ summary: 'Mark-match map (bom_assembly ↔ bim_element global_ids) for the isolate-by-status 3D view' })
  getProgressBimMatch(@Param('project_code') code: string, @Param('zone_id', ParseIntPipe) zoneId: number) {
    return this.progressSvc.getZoneBimMatch(code, zoneId)
  }

  @Patch(':project_code/progress/assemblies/:assembly_id')
  @ApiOperation({ summary: 'Upsert the 5 manual progress fields for one assembly' })
  updateAssemblyProgress(
    @Param('project_code') code: string,
    @Param('assembly_id', ParseIntPipe) assemblyId: number,
    @Body() dto: UpdateAssemblyProgressDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.progressSvc.updateAssemblyProgress(code, assemblyId, dto, user.sub)
  }

  @Get(':project_code')
  @ApiOperation({ summary: 'Get project by code' })
  findOne(@Param('project_code') code: string) {
    return this.svc.findOne(code)
  }

  @Patch(':project_code')
  @ApiOperation({ summary: 'Update project' })
  update(
    @Param('project_code') code: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(code, dto, user.sub)
  }

  @Post(':project_code/action_win')
  @ApiOperation({ summary: 'Win project: lead → won' })
  actionWin(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_win', user.sub)
  }

  @Post(':project_code/action_start_design')
  @ApiOperation({ summary: 'Start design: won → in_design' })
  actionStartDesign(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_start_design', user.sub)
  }

  @Post(':project_code/action_close')
  @ApiOperation({ summary: 'Close project' })
  actionClose(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_close', user.sub)
  }
}
