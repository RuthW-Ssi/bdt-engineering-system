import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseInterceptors, UploadedFiles,
  ParseIntPipe, UseGuards, BadRequestException,
  Res, HttpStatus, HttpCode,
} from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import type { Response } from 'express'
import { BomUploadService, FileInput, NcFileInput } from './bom-upload.service'
import { BomDiffService } from './bom-diff.service'
import { BomDiffBimMatchService } from './bom-diff-bim-match.service'
import { PaintConfigService, SavePaintConfigDto } from './paint-config.service'
import { MarkRenameService } from './mark-rename.service'
import { MarkRevHistoryService } from './mark-rev-history.service'
import { parseBaseField, parseRevsField, UPLOAD_FILE_FIELDS } from './upload-body'
import { classifyFilename } from './filename-classifier'
import type { BomDocType } from './filename-classifier'
import { QueryDispatchDto, QueryDiffBimModelsDto, QueryLatestRevisionDto } from './dto/dispatch.dto'
import { SaveAssemblyMatchDto } from './dto/assembly-match.dto'
import { SaveRenamesDto } from './dto/rename.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'

interface MulterFile {
  fieldname: string
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

@ApiTags('bom-upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller()
export class BomUploadController {
  constructor(
    private readonly svc: BomUploadService,
    private readonly diffSvc: BomDiffService,
    private readonly diffBimMatchSvc: BomDiffBimMatchService,
    private readonly paintSvc: PaintConfigService,
    private readonly renameSvc: MarkRenameService,
    private readonly revHistorySvc: MarkRevHistoryService,
  ) {}

  @Post('bom/upload')
  @RequiresPermission('boms', 'create')
  @ApiOperation({ summary: 'Upload BOM files (Assembly List, Assembly Part List, Part List; optional Dispatch Note — one in combined mode, a Main and an Acc one in separate mode) + NC files' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['project_id', 'zone_id', 'bom_files', 'doc_types', 'nc_files'],
      properties: {
        project_id: { type: 'integer' },
        zone_id: { type: 'integer' },
        sub_zone_id: { type: 'integer' },
        upload_mode: { type: 'string', enum: ['combined', 'separate'] },
        revs: { type: 'string', description: 'JSON [{mark, rev}] from the review table' },
        base_dispatch_id: { type: 'string' },
        bom_files: { type: 'array', maxItems: 8, items: { type: 'string', format: 'binary' } },
        nc_files: { type: 'array', items: { type: 'string', format: 'binary' } },
        doc_types: { type: 'array', items: { type: 'string' }, description: 'One per bom_files entry: ASSEMBLY_LIST | ASSEMBLY_PART_LIST | PART_LIST | DISPATCH_NOTE (combined), or MAIN_*/ACC_* incl. MAIN_DISPATCH_NOTE / ACC_DISPATCH_NOTE (separate). Max 8 files.' },
      },
    },
  })
  @UseInterceptors(FileFieldsInterceptor(
    UPLOAD_FILE_FIELDS,
    { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } },
  ))
  async upload(
    @UploadedFiles() uploadedFiles: { bom_files?: MulterFile[]; nc_files?: MulterFile[] },
    @Body() body: Record<string, string | string[]>,
    @CurrentUser() user: JwtPayload,
  ) {
    const bomFiles = uploadedFiles?.bom_files ?? []
    const ncRaw = uploadedFiles?.nc_files ?? []

    if (!bomFiles.length) throw new BadRequestException('No BOM files uploaded')
    if (!ncRaw.length) throw new BadRequestException('NC files are required — upload at least one .nc1 file')

    const projectId = parseInt(String(body['project_id']), 10)
    const zoneId = parseInt(String(body['zone_id']), 10)
    const subZoneIdRaw = body['sub_zone_id']
    const subZoneId = subZoneIdRaw ? parseInt(String(subZoneIdRaw), 10) : null

    if (isNaN(projectId) || isNaN(zoneId)) {
      throw new BadRequestException('project_id and zone_id must be valid integers')
    }

    // doc_types may arrive as a single string or array
    const rawDocTypes = Array.isArray(body['doc_types']) ? body['doc_types'] : [body['doc_types']]

    const fileInputs = this.buildFileInputs(bomFiles, rawDocTypes)

    const ncInputs: NcFileInput[] = ncRaw.map(f => ({
      buffer: f.buffer,
      originalname: f.originalname,
    }))

    const uploadMode = (body['upload_mode'] === 'separate' ? 'separate' : 'combined') as 'combined' | 'separate'
    const revs = parseRevsField(body['revs'])
    const baseDispatchId = parseBaseField(body['base_dispatch_id'])
    return this.svc.upload(fileInputs, ncInputs, projectId, zoneId, subZoneId, user.sub, uploadMode, { revs, baseDispatchId })
  }

  @Post('bom/upload/preview')
  @RequiresPermission('boms', 'create')
  @ApiOperation({ summary: 'Dry-run: junction check + per-mark Rev review (optional Dispatch Note; separate mode: one per Main/Acc slot) — no DB writes' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['project_id', 'zone_id', 'bom_files', 'doc_types', 'nc_files'],
      properties: {
        project_id: { type: 'integer' },
        zone_id: { type: 'integer' },
        sub_zone_id: { type: 'integer' },
        upload_mode: { type: 'string', enum: ['combined', 'separate'] },
        bom_files: { type: 'array', maxItems: 8, items: { type: 'string', format: 'binary' } },
        nc_files: { type: 'array', items: { type: 'string', format: 'binary' } },
        doc_types: { type: 'array', items: { type: 'string' }, description: 'One per bom_files entry: ASSEMBLY_LIST | ASSEMBLY_PART_LIST | PART_LIST | DISPATCH_NOTE (combined), or MAIN_*/ACC_* incl. MAIN_DISPATCH_NOTE / ACC_DISPATCH_NOTE (separate). Max 8 files.' },
      },
    },
  })
  @UseInterceptors(FileFieldsInterceptor(
    UPLOAD_FILE_FIELDS,
    { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } },
  ))
  async previewUpload(
    @UploadedFiles() uploadedFiles: { bom_files?: MulterFile[]; nc_files?: MulterFile[] },
    @Body() body: Record<string, string | string[]>,
  ) {
    const bomFiles = uploadedFiles?.bom_files ?? []
    if (!bomFiles.length) throw new BadRequestException('No BOM files uploaded')
    const projectId = parseInt(String(body['project_id']), 10)
    const zoneId = parseInt(String(body['zone_id']), 10)
    if (isNaN(projectId) || isNaN(zoneId)) throw new BadRequestException('project_id and zone_id must be valid integers')
    const subZoneId = body['sub_zone_id'] ? parseInt(String(body['sub_zone_id']), 10) : null
    const rawDocTypes = Array.isArray(body['doc_types']) ? body['doc_types'] : [body['doc_types']]
    const fileInputs = this.buildFileInputs(bomFiles, rawDocTypes)
    const ncInputs: NcFileInput[] = (uploadedFiles?.nc_files ?? []).map(f => ({ buffer: f.buffer, originalname: f.originalname }))
    const uploadMode = (body['upload_mode'] === 'separate' ? 'separate' : 'combined') as 'combined' | 'separate'
    return this.svc.preview(fileInputs, ncInputs, uploadMode, { projectId, zoneId, subZoneId })
  }

  private buildFileInputs(bomFiles: MulterFile[], rawDocTypes: (string | undefined)[]): FileInput[] {
    return bomFiles.map((f, i) => {
      const docType: BomDocType = (rawDocTypes[i] as BomDocType) ?? classifyFilename(f.originalname)
      if (!docType) {
        throw new BadRequestException(
          `Cannot determine doc_type for file "${f.originalname}" — rename it or pass doc_types explicitly`,
        )
      }
      return {
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        docType,
      }
    })
  }

  @Get('dispatches')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'List BOM dispatches' })
  list(@Query() query: QueryDispatchDto) {
    return this.svc.list(query)
  }

  @Get('dispatches/latest-revision')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Get the latest revision number for a zone/sub-zone (null if none exists yet)' })
  getLatestRevision(@Query() query: QueryLatestRevisionDto) {
    return this.svc.getLatestRevision(query.project_id, query.zone_id, query.sub_zone_id ?? null)
  }

  @Get('dispatches/:id')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Get BOM dispatch detail' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get('dispatches/:id/revisions')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Get revision history for a dispatch' })
  getRevisions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRevisions(id)
  }

  @Get('dispatches/:id/diff')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Compare dispatch with its previous version' })
  async getDiff(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const result = await this.diffSvc.computeDiff(id)
    if (!result) return res.status(HttpStatus.NO_CONTENT).send()
    return res.status(HttpStatus.OK).json(result)
  }

  @Get('dispatches/:id/diff/bim-models')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: "Match the diff's assembly marks against the project's 2 most recent complete BIM model versions" })
  async getDiffBimModels(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryDiffBimModelsDto,
    @Res() res: Response,
  ) {
    const result = await this.diffBimMatchSvc.getDiffBimModels(id, {
      oldModelId: query.old_model_id,
      newModelId: query.new_model_id,
    })
    if (!result) return res.status(HttpStatus.NO_CONTENT).send()
    return res.status(HttpStatus.OK).json(result)
  }

  @Get('dispatches/:id/rename-candidates')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Marks/parts that disappeared in this BOM version + likely new names (rename pairing, 2026-10-21)' })
  getRenameCandidates(@Param('id', ParseIntPipe) id: number) {
    return this.renameSvc.candidates(id)
  }

  @Get('dispatches/:id/renames')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Confirmed mark/part renames of this BOM version + their History' })
  getRenames(@Param('id', ParseIntPipe) id: number) {
    return this.renameSvc.list(id)
  }

  @Post('dispatches/:id/renames')
  @RequiresPermission('boms', 'update')
  @ApiOperation({ summary: 'Confirm mark/part renames (old name = same piece as new name)' })
  saveRenames(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveRenamesDto, @CurrentUser() user: JwtPayload) {
    return this.renameSvc.pair(id, dto.renames, user.sub, user.login)
  }

  @Delete('dispatches/:id/renames/:renameId')
  @RequiresPermission('boms', 'update')
  @ApiOperation({ summary: 'Undo a rename pair while nothing has used it (a1)' })
  undoRename(@Param('id', ParseIntPipe) id: number, @Param('renameId', ParseIntPipe) renameId: number, @CurrentUser() user: JwtPayload) {
    return this.renameSvc.undo(id, renameId, user.sub, user.login)
  }

  @Get('bom/assemblies/:id/rev-history')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: "A mark's BOM Rev history — field old→new, parts, renames, who/when (2026-10-26)" })
  getRevHistory(@Param('id', ParseIntPipe) id: number) {
    return this.revHistorySvc.history(id)
  }

  @Get('dispatches/:id/mapping')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Get eBOM ↔ mBOM product mapping for a dispatch' })
  getMapping(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMapping(id)
  }

  @Get('dispatches/:id/paint-config')
  @RequiresPermission('boms', 'view')
  @ApiOperation({ summary: 'Get paint config for a dispatch' })
  getPaintConfig(@Param('id', ParseIntPipe) id: number) {
    return this.paintSvc.getConfig(id)
  }

  @Post('dispatches/:id/paint-config')
  @RequiresPermission('boms', 'update')
  @ApiOperation({ summary: 'Save paint config for a dispatch' })
  savePaintConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SavePaintConfigDto,
  ) {
    return this.paintSvc.saveConfig(id, dto)
  }

  @Post('dispatches/:id/assembly-match')
  @RequiresPermission('boms', 'update')
  @HttpCode(204)
  @ApiOperation({ summary: 'Save Standard/Custom type assignments for assemblies' })
  saveAssemblyMatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveAssemblyMatchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.saveAssemblyMatch(id, dto.assignments, user.sub)
  }
}
