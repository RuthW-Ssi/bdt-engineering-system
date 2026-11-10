import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body,
  UseInterceptors, UploadedFiles,
  ParseIntPipe, UseGuards, BadRequestException, Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { CuttingPlanService, CuttingPlanFileInput, MAX_PLATES, MAX_TXT_BYTES } from './cutting-plan.service'
import { QueryCuttingPlanDto } from './dto/query-cutting-plan.dto'
import { BulkAssignOrderPartProjectCodeDto } from './dto/bulk-assign-order-part-project-code.dto'
import { PreviewCuttingPlanDto, SaveCuttingPlanDto, SaveShapeCuttingPlanDto, StagingUrlsDto } from './dto/upload-cutting-plan.dto'
import { CuttingPlanShapeService, MAX_SHAPE_FILES, MAX_SHAPE_PDF_BYTES } from './shape/cutting-plan-shape.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'

const UPLOAD_BODY_SCHEMA = {
  type: 'object' as const,
  required: ['files', 'project_id', 'zone_id', 'version', 'revision'],
  properties: {
    files: { type: 'array', items: { type: 'string', format: 'binary' } },
    project_id: { type: 'integer' },
    zone_id: { type: 'integer' },
    sub_zone_id: { type: 'integer' },
    lot: { type: 'string', maxLength: 60 },
    description: { type: 'string' },
    file_names: { type: 'string', description: 'JSON array of every picked file name' },
    version: { type: 'string' },
    revision: { type: 'string' },
  },
}

@ApiTags('cutting-plan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('cutting-plan')
export class CuttingPlanController {
  constructor(private readonly svc: CuttingPlanService, private readonly shape: CuttingPlanShapeService) {}

  @Post('upload/preview')
  @RequiresPermission('cutting-plan', 'create')
  @ApiOperation({ summary: 'Parse the .txt reports and check the four files per plate — no DB or storage writes' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: UPLOAD_BODY_SCHEMA })
  @UseInterceptors(FilesInterceptor('files', MAX_PLATES, { storage: memoryStorage(), limits: { fileSize: MAX_TXT_BYTES } }))
  async preview(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: PreviewCuttingPlanDto,
  ) {
    return this.svc.preview(this.buildFileInputs(files), body, body.file_names ?? [])
  }

  @Post('upload/staging-urls')
  @RequiresPermission('cutting-plan', 'create')
  @ApiOperation({ summary: 'Signed upload URLs for every file of an upload, in one call (files go straight to storage)' })
  async stagingUrls(@Body() body: StagingUrlsDto) {
    return this.svc.stagingUrls(body.project_id, body.file_names)
  }

  @Post('upload')
  @RequiresPermission('cutting-plan', 'create')
  @ApiOperation({ summary: 'Save: parse the staged .txt files, store all four files per plate, persist (JSON body)' })
  async upload(@Body() body: SaveCuttingPlanDto, @CurrentUser() user: JwtPayload) {
    return this.svc.upload(body.staged, body, user.sub)
  }

  @Post('upload/shape-preview')
  @RequiresPermission('cutting-plan', 'create')
  @ApiOperation({ summary: 'Shape: read the CutLogic CP-*.pdf cutting layouts and check them — no DB or storage writes' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: UPLOAD_BODY_SCHEMA })
  @UseInterceptors(FilesInterceptor('files', MAX_SHAPE_FILES, { storage: memoryStorage(), limits: { fileSize: MAX_SHAPE_PDF_BYTES } }))
  async shapePreview(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: PreviewCuttingPlanDto,
  ) {
    return this.shape.preview((files ?? []).map(f => ({ buffer: f.buffer, originalname: f.originalname })), body, body.file_names ?? [])
  }

  @Post('upload/shape')
  @RequiresPermission('cutting-plan', 'create')
  @ApiOperation({ summary: 'Shape save: read the staged CP PDFs, store them, persist sizes → layouts → parts (JSON body)' })
  async shapeUpload(@Body() body: SaveShapeCuttingPlanDto, @CurrentUser() user: JwtPayload) {
    return this.shape.upload(body.staged, body, user.sub)
  }

  @Get(':id/plate-view')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Geometry + cut path + machine feeds of one plate, for the 2D / 3D viewer' })
  async plateView(@Param('id', ParseIntPipe) id: number, @Query('plate') plate: string) {
    if (!plate) throw new BadRequestException('plate is required')
    return this.svc.plateView(id, plate)
  }

  @Get('files/:fileId/download')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Download one stored plate file (.txt / .xls / .pdf / .dxf)' })
  async download(@Param('fileId', ParseIntPipe) fileId: number, @Res() res: Response) {
    const { file, contentType, buffer } = await this.svc.getFile(fileId)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(buffer)
  }

  @Get()
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'List cutting plan uploads' })
  async list(@Query() query: QueryCuttingPlanDto) {
    return this.svc.list(query)
  }

  @Get(':id')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'Get one cutting plan upload with its full parsed data' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Patch('order-parts/project-code')
  @RequiresPermission('cutting-plan', 'update')
  @ApiOperation({ summary: 'Bulk-assign a project_code to one or more order_part rows (any upload)' })
  async bulkAssignOrderPartProjectCode(@Body() dto: BulkAssignOrderPartProjectCodeDto) {
    return this.svc.bulkAssignOrderPartProjectCode(dto)
  }

  @Delete(':id')
  @RequiresPermission('cutting-plan', 'delete')
  @ApiOperation({ summary: 'Delete a cutting plan upload and all its parsed data' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }

  private buildFileInputs(files: Express.Multer.File[] | undefined): CuttingPlanFileInput[] {
    if (!files?.length) throw new BadRequestException('No files uploaded')
    return files.map(f => ({ buffer: f.buffer, originalname: f.originalname }))
  }
}
