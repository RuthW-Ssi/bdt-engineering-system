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
  UploadedFiles,
  UseGuards,
  UseInterceptors, Put } from '@nestjs/common'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
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
import { CreateMoDto, LinkBomDto, MergePreshopDto, UpdatePreshopPartsDto } from './dto/create-mo.dto'
import { UpdateMoDto } from './dto/update-mo.dto'
import { ChangeStatusDto } from './dto/change-status.dto'
import { UpdateMoActualDatesDto } from './dto/update-actual-dates.dto'
import { CreateWoDto, PreviewWoDto } from './dto/create-wo.dto'
import { CreateMoPartDto, UpdateMoPartDto } from './dto/create-mo-part.dto'
import { MoPartService } from './mo-part/mo-part.service'
import { parseMaterialList } from './mo-part/material-list-parser'
import { parseDispatchNote } from './mo-part/dispatch-note-parser'
import { ncDetailsToLines } from './mo-part/nc-lines'
import { PreshopService } from './preshop/preshop.service'
import { checkPdfUploads, parseBomRows, pdfRows } from './preshop/preshop-pdf-parser'
import { parseNcDetail } from '../bom-upload/nc-parser'

@ApiTags('Manufacturing Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('mo')
export class ManufacturingOrderController {
  constructor(
    private readonly svc: ManufacturingOrderService,
    private readonly moPrint: MoPrintService,
    private readonly moPart: MoPartService,
    private readonly preshop: PreshopService,
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

  @Post('part/import/dispatch-note')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'MO Part · parse a Dispatch Note (first sheet, not stored) into marks' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  importDispatchNote(@UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('file is required')
    return { ...parseDispatchNote(file.buffer), filename: file.originalname }
  }

  @Post('part/import/nc')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'MO Part · parse NC1 files (not stored) into one line per part mark' })
  @ApiConsumes('multipart/form-data')
  // NC1 files are tiny (Bangna: 675 plates, largest 1.9 KB) — cap per file
  // and count so one request can't hold more than ~128 MB in memory.
  @UseInterceptors(FilesInterceptor('files', 2000, { storage: memoryStorage(), limits: { fileSize: 64 * 1024, files: 2000 } }))
  importNc(@UploadedFiles() files?: { originalname: string; buffer: Buffer }[]) {
    if (!files?.length) throw new BadRequestException('files are required')
    const notNc = files.filter(f => !/\.nc1?$/i.test(f.originalname)).map(f => f.originalname)
    if (notNc.length) throw new BadRequestException(`Not NC1 files: ${notNc.slice(0, 5).join(', ')}${notNc.length > 5 ? ' …' : ''}`)
    const details = files.map(f => parseNcDetail(f.originalname, f.buffer.toString('utf-8')))
    return { ...ncDetailsToLines(details), files_count: files.length }
  }

  // ── Pre-shop MO uploads (2026-10-07) — parsed in memory, never stored ──────
  @Post('preshop/import/dispatch-note')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'Pre-shop MO · parse ONE Dispatch Note (first sheet) into assemblies (sets, H×B×L, weight per set)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  importPreshopDispatchNote(@UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('file is required')
    if (!/\.xlsx?$/i.test(file.originalname)) throw new BadRequestException('Dispatch Note: .xls or .xlsx only')
    const { marks, warnings } = parseDispatchNote(file.buffer)
    return { filename: file.originalname, assemblies: this.preshop.fromDispatchNote(marks), warnings }
  }

  @Post('preshop/import/pdf')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'Pre-shop MO · parse pre-shop drawing PDFs (Tekla BILL OF MATERIAL) into assemblies + parts per set' })
  @ApiConsumes('multipart/form-data')
  // Celestica's 4-drawing PDF is 112 KB — 100 files × 10 MB caps one request's memory.
  @UseInterceptors(FilesInterceptor('files', 100, { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 100 } }))
  async importPreshopPdf(@UploadedFiles() files?: { originalname: string; size: number; buffer: Buffer }[]) {
    if (!files?.length) throw new BadRequestException('files are required')
    checkPdfUploads(files)
    const parsed: { filename: string; assemblies: ReturnType<typeof parseBomRows> }[] = []
    for (const f of files) parsed.push({ filename: f.originalname, assemblies: parseBomRows(await pdfRows(f.buffer)) })
    return { ...this.preshop.mergeFiles(parsed), files: files.map(f => f.originalname) }
  }

  @Post(':id/preshop')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'PRE_SHOP MO · add / fill in assemblies from ONE source (Dispatch Note, pre-shop drawing, BOM) — any status but DONE/CANCELLED, logged in History' })
  mergePreshop(@Param('id', ParseIntPipe) id: number, @Body() dto: MergePreshopDto, @CurrentUser() user: JwtPayload) {
    return this.svc.mergePreshop(id, dto, user.sub, user.login)
  }

  @Get(':id/qc-check')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'What still keeps the MO from Complete: each operation × mark whose QC-passed sets are short of its sets (empty = ready)' })
  qcCheck(@Param('id', ParseIntPipe) id: number) {
    return this.svc.qcShortfalls(id)
  }

  @Get(':id/bom-compare')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'PRE_SHOP MO · its marks vs the zone\'s real BOM (latest upload) — what differs, what is only on one side, what is already reviewed' })
  bomCompare(@Param('id', ParseIntPipe) id: number) {
    return this.svc.bomCompare(id)
  }

  @Post(':id/bom-link')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'PRE_SHOP MO · apply the user\'s decisions against the real BOM (per mark apply / keep / remove, add BOM-only marks) — logged in History' })
  linkBom(@Param('id', ParseIntPipe) id: number, @Body() dto: LinkBomDto, @CurrentUser() user: JwtPayload) {
    return this.svc.linkBom(id, dto, user.sub, user.login)
  }

  @Put(':id/lines/:lineId/parts')
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'PRE_SHOP MO · replace one assembly\'s part list (per set) — parts on a WO cannot be removed; logged in History' })
  updatePreshopParts(@Param('id', ParseIntPipe) id: number, @Param('lineId', ParseIntPipe) lineId: number, @Body() dto: UpdatePreshopPartsDto, @CurrentUser() user: JwtPayload) {
    return this.svc.updatePreshopParts(id, lineId, dto.parts, user.sub, user.login)
  }

  @Get('zone-bom')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'Whether a zone has a real BOM (needed for a Full shop MO)' })
  async zoneBom(@Query('zone_id', ParseIntPipe) zoneId: number) {
    return { has_bom: await this.svc.zoneHasBom(zoneId) }
  }

  @Get('zone-check')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'The live MO already holding a zone (1 zone = 1 MO), or null' })
  zoneCheck(@Query('zone_id', ParseIntPipe) zoneId: number) {
    return this.svc.zoneMo(zoneId)
  }

  @Get('part/import/bom-parts')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'MO Part · ACTIVE parts of a dispatch grouped by size (qty = bom_part.qty)' })
  importBomParts(@Query('dispatch_id', ParseIntPipe) dispatchId: number, @Query('slot') slot?: string) {
    if (slot != null && slot !== 'MAIN' && slot !== 'ACC') throw new BadRequestException('slot must be MAIN or ACC')
    return this.moPart.bomPartLines(dispatchId, slot as 'MAIN' | 'ACC' | undefined)
  }

  @Get('part/default-routing')
  @RequiresPermission('orders', 'create')
  @ApiOperation({ summary: 'MO Part · routing a new MO Part gets automatically (Mark Prefix OTH), or null' })
  defaultPartRouting() {
    return this.moPart.defaultRouting()
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

  @Get(':id/part-history')
  @RequiresPermission('orders', 'view')
  @ApiOperation({ summary: 'MO Part · change log, newest first' })
  getPartHistory(@Param('id', ParseIntPipe) id: number) {
    return this.moPart.history(id)
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
    return this.svc.update(id, dto, user.sub, user.login)
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
    return this.svc.updateActualDates(id, dto, user.sub, user.login)
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
    @CurrentUser() user: JwtPayload,
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
    const bytes = await this.moPrint.buildPdf(id, woIds, includeManifest, parsePrintLang(langRaw), user.login)
    res.set({ 'Content-Type': 'application/pdf' })
    res.send(Buffer.from(bytes))
  }
}
