import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { Response } from 'express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { MoStatus } from '@prisma/client'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { ManufacturingOrderService } from './manufacturing-orders.service'
import { MoPrintService } from './mo-print/mo-print.service'
import { parsePrintLang } from './mo-print/mo-print-labels'
import { CreateMoDto } from './dto/create-mo.dto'
import { UpdateMoDto } from './dto/update-mo.dto'
import { ChangeStatusDto } from './dto/change-status.dto'
import { UpdateMoActualDatesDto } from './dto/update-actual-dates.dto'
import { CreateWoDto, PreviewWoDto } from './dto/create-wo.dto'
import { CreateMoPartDto, UpdateMoPartDto } from './dto/create-mo-part.dto'
import { MoPartService } from './mo-part/mo-part.service'
import { parseMaterialList } from './mo-part/material-list-parser'

@ApiTags('Manufacturing Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('mo')
export class ManufacturingOrderController {
  constructor(
    private readonly svc: ManufacturingOrderService,
    private readonly moPrint: MoPrintService,
    private readonly moPart: MoPartService,
  ) {}

  // ── MO Part (wiki features/mo-part-import-plan) — declared before the
  // ':id' routes so 'part' is never parsed as an MO id.
  @Post('part/import/material-list')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'MO Part · parse a Material List file (not stored) into size lines' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  importMaterialList(@UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('file is required')
    return { ...parseMaterialList(file.buffer), filename: file.originalname }
  }

  @Get('part/import/bom-parts')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'MO Part · ACTIVE parts of a dispatch grouped by size (qty = bom_part.qty)' })
  importBomParts(@Query('dispatch_id', ParseIntPipe) dispatchId: number, @Query('slot') slot?: string) {
    if (slot != null && slot !== 'MAIN' && slot !== 'ACC') throw new BadRequestException('slot must be MAIN or ACC')
    return this.moPart.bomPartLines(dispatchId, slot as 'MAIN' | 'ACC' | undefined)
  }

  @Post('part')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'Create MO Part (size lines from one source)' })
  createPart(@Body() dto: CreateMoPartDto, @CurrentUser() user: JwtPayload) {
    return this.moPart.create(dto, user.sub, user.login)
  }

  @Patch('part/:id')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Edit a DRAFT MO Part (header + replace all lines)' })
  updatePart(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMoPartDto, @CurrentUser() user: JwtPayload) {
    return this.moPart.update(id, dto, user.sub, user.login)
  }

  @Get()
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'List MOs · filter status|mark_prefix|project · search mo_code' })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] })
  @ApiQuery({ name: 'mark_prefix', required: false })
  @ApiQuery({ name: 'project_id', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('status') status?: MoStatus,
    @Query('mark_prefix') mark_prefix?: string,
    @Query('project_id') project_id?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll({
      status: status || undefined,
      mark_prefix: mark_prefix || undefined,
      project_id: project_id ? Number(project_id) : undefined,
      search: search || undefined,
    })
  }

  @Get(':id')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'MO detail + derived projects/customers (P20)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get(':id/assemblies')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Assembly lines + total/remaining + allocation breakdown' })
  @ApiQuery({ name: 'operation_id', required: false, description: 'When given, each line also gets wo_remaining — qty still unplanned for this operation, after sibling work orders of the same operation' })
  getAssemblies(@Param('id', ParseIntPipe) id: number, @Query('operation_id') operation_id?: string) {
    return this.svc.getAssemblies(id, operation_id ? Number(operation_id) : undefined)
  }

  @Get(':id/parts')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Aggregated parts (bom_part) across all assemblies in the MO' })
  getParts(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getParts(id)
  }

  @Get(':id/history')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'MO-level status history' })
  getHistory(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getHistory(id)
  }

  @Get(':id/consume-summary')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Planned material totals for all WOs in this MO' })
  getConsumeSummary(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getConsumeSummary(id)
  }

  @Post()
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'Create DRAFT MO · snapshot routing ops · validate qty (P13)' })
  create(@Body() dto: CreateMoDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub, user.login)
  }

  @Patch(':id')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Edit DRAFT MO (409 otherwise)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Patch(':id/status')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Change status + reason → history · DONE requires user-typed actual_start + actual_finish (never system-stamped)' })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.changeStatus(id, dto, user.sub, user.login)
  }

  @Patch(':id/actual-dates')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Edit actual_start/actual_finish of a DONE MO (409 otherwise) · audit-logged' })
  updateActualDates(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMoActualDatesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateActualDates(id, dto, user.sub)
  }

  @Delete(':id')
  @RequiresPermission('orders', 'delete')
  @ApiOperation({ summary: 'Cancel MO (DRAFT/CONFIRMED only · returns qty · P15)' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.cancel(id, user.sub, user.login)
  }

  // Multi-mark redesign (2026-09-17): WO creation is now fully manual — this
  // replaces the old auto-create-on-confirm flow. Find-or-creates the WO for
  // (this MO, operation_id), then adds a work_order_mark row for each assembly
  // line not already on it (idempotent — already-present ones are reported as
  // skipped, never duplicated).
  @Post(':id/work-orders')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Create/add-marks: find-or-create the WO for (this MO, operation_id) + attach assembly lines as marks' })
  createWorkOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateWoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createWorkOrder(id, dto, user.login, user.sub)
  }

  // Single-page form revision (2026-09-17): read-only preview of what
  // createWorkOrder would compute for Parts/Consume, for the CURRENT
  // mark+qty selection — called live as the user picks marks, before Create
  // is ever pressed. No DB writes.
  @Post(':id/work-orders/preview')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Preview Parts + Consume for a candidate (operation, marks) selection — no writes' })
  previewWorkOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PreviewWoDto,
  ) {
    return this.svc.previewWorkOrder(id, dto)
  }

  // Plain @Res() (no passthrough) — Nest's passthrough mode still JSON-
  // serializes whatever the handler returns (a raw Buffer becomes
  // {"type":"Buffer","data":[...]}, confirmed live against a real request),
  // so the binary body must be sent manually. Exceptions thrown inside
  // buildPdf() (NotFoundException, the missing-drawing ConflictException)
  // are still caught by Nest's normal exception filters regardless — only
  // the success path bypasses Nest's own response handling here.
  @Get(':id/print-packet')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Print packet — optional MO overview page + one signable traveler per selected WO + embedded shop drawings (409 if any selected WO is missing a PDF drawing, or nothing at all is selected)' })
  @ApiQuery({ name: 'wo_ids', required: false, description: 'Comma-separated WO ids to include as travelers (2026-09-21 selective print). Omitted = every non-cancelled WO.' })
  @ApiQuery({ name: 'include_manifest', required: false, description: '"false" to omit the MO overview page — e.g. printing just some WO travelers, or (with wo_ids empty) just the MO overview alone. Omitted/anything else = included (prior behavior).' })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'th'], description: 'Language of the printed form labels. Omitted/anything else = en (prior behavior).' })
  async printPacket(
    @Param('id', ParseIntPipe) id: number,
    @Query('wo_ids') woIdsRaw: string | undefined,
    @Query('include_manifest') includeManifestRaw: string | undefined,
    @Query('lang') langRaw: string | undefined,
    @Res() res: Response,
  ) {
    // `!== undefined` (not a truthy check) — the frontend's picker sends
    // `wo_ids=` (empty string) on purpose when the user deselects every WO
    // ("just the MO"), and that must parse to `[]` (explicit: zero WOs), not
    // fall through to `undefined` (implicit: every WO — the no-filter
    // default when the param is omitted entirely). A truthy check on '' would
    // wrongly collapse those two very different requests into one.
    const woIds = woIdsRaw !== undefined
      ? woIdsRaw.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n))
      : undefined
    const includeManifest = includeManifestRaw !== 'false'
    const bytes = await this.moPrint.buildPdf(id, woIds, includeManifest, parsePrintLang(langRaw))
    res.set({ 'Content-Type': 'application/pdf' })
    res.send(Buffer.from(bytes))
  }
}
