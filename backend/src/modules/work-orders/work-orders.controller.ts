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
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { WorkOrdersService } from './work-orders.service'
import { ScheduleService } from './schedule.service'
import { WoBimMatchService } from './wo-bim-match.service'
import { CancelWoDto, WoActualsDto, WoDoneDto, WoNoteDto, WoReasonDto } from './dto/wo-transition.dto'
import { RemoveMarkDto } from './dto/remove-mark.dto'
import { AcceptVersionDto } from './dto/accept-version.dto'
import { UpdateConsumeDto } from './dto/update-consume.dto'
import { UpdatePartsDto } from './dto/update-parts.dto'

@ApiTags('Work Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('wo')
export class WorkOrdersController {
  constructor(
    private readonly svc: WorkOrdersService,
    private readonly schedule: ScheduleService,
    private readonly bimMatch: WoBimMatchService,
  ) {}

  @Get()
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'List WOs · filter status|mo_id|work_center_id|mark_prefix_code · search wo_code' })
  @ApiQuery({ name: 'status', required: false, enum: ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD', 'DONE', 'CANCELLED'] })
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
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'WO detail + MO context + operation snapshot + per-mark snapshot dispatch/qty/bom-version status' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get(':id/events')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'WO event log (newest first)' })
  getEvents(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getEvents(id)
  }

  // ── Status transitions (T-WO.05) · invalid → 409 with allowed_next[] ─────────
  @Post(':id/release')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'NOT_STARTED → RELEASED · sets released_at/by' })
  release(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'release', dto, user.login)
  }

  @Post(':id/start')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'RELEASED → IN_PROGRESS · no longer sets actual_start (user-typed at Done) · seeds qty_not_started · event=START' })
  start(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'start', dto, user.login)
  }

  @Post(':id/pause')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'IN_PROGRESS → PAUSED · requires reason · event=PAUSE' })
  pause(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoReasonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'pause', dto, user.login)
  }

  @Post(':id/resume')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'PAUSED → IN_PROGRESS (event=RESUME), OR ON_HOLD → restores pre_hold_status (event=UNHOLD) — branches on current status' })
  resume(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.resume(id, dto, user.login)
  }

  // Manual hold (multi-mark redesign, 2026-09-17) — factory admin/manager action
  // only, never auto-triggered by BOM uploads any more.
  @Post(':id/hold')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Any non-terminal status → ON_HOLD · requires reason · captures pre_hold_status · event=HOLD' })
  hold(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoReasonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.transition(id, 'hold', dto, user.login)
  }

  @Post(':id/done')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'IN_PROGRESS|PAUSED → DONE · body.marks[] must cover every non-removed mark · requires user-typed actual_start + actual_finish + timeliness (ON_PLAN|DELAYED; delay_note required when DELAYED) · event=DONE (whole-WO)' })
  done(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoDoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.done(id, dto, user.login)
  }

  @Patch(':id/actual-dates')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Edit actual_start/actual_finish/timeliness/delay_note of a DONE WO (409 otherwise) · audit-logged' })
  updateActuals(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WoActualsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateActuals(id, dto, user.login, user.sub)
  }

  @Post(':id/cancel')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'any non-terminal → CANCELLED · requires reason + per-mark QC breakdown (mark_disposition[]: qty_qc_passed/qty_rework/qty_renew) for marks with output · event=CANCEL · cascades to no-output sibling WOs sharing a mark' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelWoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.cancel(id, dto, user.login)
  }

  @Get(':id/cancel-siblings')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Preview cascade-cancel: to_cancel (no output, auto-cancelled) vs needs_disposition (real output, left untouched)' })
  cancelSiblings(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancelSiblings(id)
  }

  // Multi-mark redesign (2026-09-17): removes ONE mark from a WO, distinct from
  // cancelling the whole WO above. The WO's last non-removed mark cannot be
  // removed this way — cancel the whole WO instead in that case.
  @Post(':id/remove-mark')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Soft-remove one mark from this WO · requires reason + QC breakdown (qty_qc_passed/qty_rework/qty_renew) if that mark has output · 400 if it is the WO\'s last mark · cascades to no-output sibling WOs carrying the same mark · event=MARK_REMOVED' })
  removeMark(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RemoveMarkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.removeMark(id, dto, user.login)
  }

  // Plan-vs-actual material consume (2026-09-17): qty_planned is computed
  // automatically (WorkOrderAutoCreateService.recomputeConsume, on create/add-marks/
  // remove-mark/accept-new-version); this route records the real qty_actual —
  // no upper bound, real usage can exceed the plan.
  @Patch(':id/consume')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Record actual material usage per material_id (no cap vs the planned qty) · 400 if a material_id isn\'t already planned on this WO' })
  updateConsume(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConsumeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateConsumeActuals(id, dto, user.login)
  }

  // Part withdrawal — plan vs actual (2026-09-17), same shape as /consume above
  // but for bom_assembly_part rows (WorkOrderAutoCreateService.recomputeParts).
  @Patch(':id/parts')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Set part withdrawal weight_kg per bom_assembly_part_id — no plan to compare against, whatever is sent is authoritative · 400 if a part isn\'t already planned on this WO' })
  updateParts(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updatePartActuals(id, dto, user.login)
  }

  // ── BOM Version Alert (T-WO.04) — now per-mark ───────────────────────────────
  @Get(':id/bom-version-status')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Per-mark array: is_outdated + delta_types (REMOVED|QTY_CHANGED|SPEC_CHANGED) for every non-removed mark on this WO' })
  bomVersionStatus(@Param('id', ParseIntPipe) id: number) {
    return this.svc.bomVersionStatus(id)
  }

  @Post(':id/accept-new-version')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Per-mark (body.bom_assembly_id selects which): move that mark to the latest version + event=ACCEPT_VERSION · optional apply_to_other_wos to propagate to sibling WOs\' matching mark · QC breakdown (qty_qc_passed/qty_rework/qty_renew) required if qty_done exceeds the new qty' })
  acceptNewVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptVersionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.acceptNewVersion(id, user.login, dto)
  }

  // ── Schedule (T-WO.06 · read-only mockup) ────────────────────────────────────
  // Deliberately UNGATED (2026-08-07) — this isn't the real scheduling system,
  // just a WO-detail rendering aid (destined to be replaced by data pulled
  // from the actual external scheduling system later). Same shape as BIM's
  // viewer-token / bom-assemblies: if you can already view the parent WO
  // (`orders` view), you should see its schedule tab too, not gate it as its
  // own permission question.
  @Get(':id/schedule')
  @ApiOperation({ summary: 'prod_schedule rows for this WO grouped by version (active first)' })
  getSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.schedule.scheduleForWo(id)
  }

  // ── Visual tab (Sprint 28 · F-WO Visual Tab) ─────────────────────────────────
  // Deliberately UNGATED, same reasoning as `:id/schedule` right above — this
  // resolves a read-only rendering aid for a WO you already passed `orders`
  // view to load via `GET /wo/:id`, not a separate permission surface.
  //
  // `bom_assembly_id` (multi-mark redesign, 2026-09-17): wires the frontend's
  // Visual tab mark-selector through to WoBimMatchService.getBimMatch's
  // already-supported second argument — omitted, it falls back to the WO's
  // first non-removed mark (see that service's own doc comment).
  @Get(':id/bim-match')
  @ApiOperation({ summary: 'Resolve one of this WO\'s marks (default: first) to a BIM model + isolated global_id for the Visual tab' })
  @ApiQuery({ name: 'bom_assembly_id', required: false })
  getBimMatch(
    @Param('id', ParseIntPipe) id: number,
    @Query('bom_assembly_id') bomAssemblyId?: string,
  ) {
    return this.bimMatch.getBimMatch(id, bomAssemblyId ? Number(bomAssemblyId) : undefined)
  }
}
