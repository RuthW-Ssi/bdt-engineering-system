import {
  Controller, Get, Post, Param, Query, Body,
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
import { classifyFilename } from './filename-classifier'
import type { BomDocType } from './filename-classifier'
import { QueryDispatchDto, QueryDiffBimModelsDto, QueryLatestRevisionDto } from './dto/dispatch.dto'
import { SaveAssemblyMatchDto } from './dto/assembly-match.dto'
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
  ) {}

  @Post('bom/upload')
  @RequiresPermission('boms', 'create')
  @ApiOperation({ summary: 'Upload BOM files (Assembly List, Assembly Part List, Part List) + NC files' })
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
        revision_choice: { type: 'string', enum: ['continue', 'new'] },
        bom_files: { type: 'array', items: { type: 'string', format: 'binary' } },
        nc_files: { type: 'array', items: { type: 'string', format: 'binary' } },
        doc_types: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: 'bom_files', maxCount: 6 }, { name: 'nc_files', maxCount: 200 }],
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
    const revisionChoice = (body['revision_choice'] === 'continue' ? 'continue' : 'new') as 'continue' | 'new'

    return this.svc.upload(fileInputs, ncInputs, projectId, zoneId, subZoneId, user.sub, uploadMode, revisionChoice)
  }

  @Post('bom/upload/preview')
  @RequiresPermission('boms', 'create')
  @ApiOperation({ summary: 'Dry-run: check which Assembly Part List rows would fail to match an assembly/part — no DB writes' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['bom_files', 'doc_types'],
      properties: {
        upload_mode: { type: 'string', enum: ['combined', 'separate'] },
        bom_files: { type: 'array', items: { type: 'string', format: 'binary' } },
        doc_types: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: 'bom_files', maxCount: 6 }],
    { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } },
  ))
  async previewUpload(
    @UploadedFiles() uploadedFiles: { bom_files?: MulterFile[] },
    @Body() body: Record<string, string | string[]>,
  ) {
    const bomFiles = uploadedFiles?.bom_files ?? []
    if (!bomFiles.length) throw new BadRequestException('No BOM files uploaded')

    const rawDocTypes = Array.isArray(body['doc_types']) ? body['doc_types'] : [body['doc_types']]
    const fileInputs = this.buildFileInputs(bomFiles, rawDocTypes)
    const uploadMode = (body['upload_mode'] === 'separate' ? 'separate' : 'combined') as 'combined' | 'separate'

    return this.svc.previewJunctions(fileInputs, uploadMode)
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
