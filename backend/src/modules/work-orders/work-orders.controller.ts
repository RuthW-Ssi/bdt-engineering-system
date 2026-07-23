import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { WoStatus } from '@prisma/client'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { WorkOrdersService } from './work-orders.service'
import { ScheduleService } from './schedule.service'
import { UpdateWoDto } from './dto/update-wo.dto'
import { WoDoneDto, WoNoteDto, WoReasonDto } from './dto/wo-transition.dto'
import { AcceptVersionDto } from './dto/accept-version.dto'

@ApiTags('Work Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wo')
export class WorkOrdersController {
  constructor(
    private readonly svc: WorkOrdersService,
    private readonly schedule: ScheduleService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List WOs · filter status|mo_id|work_center_id|mark_prefix_code · search wo_code' })
  @ApiQuery({ name: 'status', required: false, enum: ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'DONE', 'CANCELLED'] })
  @ApiQuery({ name: 'mo_id', required: false })
  @ApiQuery({ name: 'work_center_id', required: false })
  @ApiQuery({ name: 'mark_prefix_code', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'assembly_mark', required: false, description: 'Sprint 24: mark-scoped filter (with project_id/zone_id) for the progress page WO panel' })
  @ApiQuery({ name: 'project_id', required: false })
  @ApiQuery({ name: 'zone_id', required: false })
  findAll(
    @Query('status') status?: WoStatus,
    @Query('mo_id') mo_id?: string,
    @Query('work_center_id') work_center_id?: string,
    @Query('mark_prefix_code') mark_prefix_code?: string,
    @Query('search') search?: string,
    @Query('assembly_mark') assembly_mark?: string,
    @Query('project_id') project_id?: string,
    @Query('zone_id') zone_id?: string,
  ) {
    return this.svc.findAll({
      status: status || undefined,
      mo_id: mo_id ? Number(mo_id) : undefined,
      work_center_id: work_center_id ? Number(work_center_id) : undefined,
      mark_prefix_code: mark_prefix_code || undefined,
      search: search || undefined,
      assembly_mark: assembly_mark || undefined,
      project_id: project_id ? Number(project_id) : undefined,
      zone_id: zone_id ? Number(zone_id) : undefined,
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'WO detail + MO context + operation snapshot + snapshot dispatch' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'WO event log (newest first)' })
  getEvents(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getEvents(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit WO (NOT_STARTED only · 409 otherwise)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.login)
  }

  // ── Status transitions (T-WO.05) · invalid → 409 with allowed_next[] ─────────
  @Post(':id/release')
  @ApiOperation({ summary: 'NOT_STARTED → RELEASED · sets released_at/by' })
  release(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'release', dto, user.login)
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'RELEASED → IN_PROGRESS · sets actual_start_at · event=START' })
  start(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'start', dto, user.login)
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'IN_PROGRESS → PAUSED · requires reason · event=PAUSE' })
  pause(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoReasonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'pause', dto, user.login)
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'PAUSED → IN_PROGRESS · event=RESUME' })
  resume(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'resume', dto, user.login)
  }

  @Post(':id/done')
  @ApiOperation({ summary: 'IN_PROGRESS|PAUSED → DONE · requires qty_done · sets actual_end_at · event=DONE' })
  done(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoDoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'done', dto, user.login)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'any ≠ DONE → CANCELLED · requires reason · event=CANCEL · cascades to no-output sibling WOs (same mo_id+bom_assembly_id)' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoReasonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'cancel', dto, user.login)
  }

  @Get(':id/cancel-siblings')
  @ApiOperation({ summary: 'Preview cascade-cancel: to_cancel (no output, auto-cancelled) vs needs_disposition (real output, left untouched)' })
  cancelSiblings(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancelSiblings(id)
  }

  // ── BOM Version Alert (T-WO.04) ──────────────────────────────────────────────
  @Get(':id/bom-version-status')
  @ApiOperation({ summary: 'is_outdated + delta_types (REMOVED|QTY_CHANGED|SPEC_CHANGED)' })
  bomVersionStatus(@Param('id', ParseIntPipe) id: number) {
    return this.svc.bomVersionStatus(id)
  }

  @Post(':id/accept-new-version')
  @ApiOperation({ summary: 'Move bom_dispatch_id_snapshot to latest + event=ACCEPT_VERSION · note required + qty_reusable conditional when resolving ON_HOLD' })
  acceptNewVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptVersionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.acceptNewVersion(id, user.login, dto)
  }

  // ── Schedule (T-WO.06 · read-only mockup) ────────────────────────────────────
  @Get(':id/schedule')
  @ApiOperation({ summary: 'prod_schedule rows for this WO grouped by version (active first)' })
  getSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.schedule.scheduleForWo(id)
  }
}
