import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body,
  UseInterceptors, UploadedFiles,
  ParseIntPipe, UseGuards, BadRequestException,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { CuttingPlanService, CuttingPlanFileInput, CuttingPlanUploadFields } from './cutting-plan.service'
import { QueryCuttingPlanDto } from './dto/query-cutting-plan.dto'
import { BulkAssignOrderPartProjectCodeDto } from './dto/bulk-assign-order-part-project-code.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'

interface MulterFile {
  fieldname: string
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

const UPLOAD_BODY_SCHEMA = {
  type: 'object' as const,
  required: ['files', 'tag', 'version', 'revision'],
  properties: {
    files: { type: 'array', items: { type: 'string', format: 'binary' } },
    project_code: { type: 'string' },
    tag: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string' },
    revision: { type: 'string' },
  },
}

@ApiTags('cutting-plan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cutting-plan')
export class CuttingPlanController {
  constructor(private readonly svc: CuttingPlanService) {}

  @Post('upload/preview')
  @ApiOperation({ summary: 'Parse uploaded cutting-plan .txt reports via the external API — no DB writes' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: UPLOAD_BODY_SCHEMA })
  @UseInterceptors(FilesInterceptor('files', 50, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async preview(
    @UploadedFiles() files: MulterFile[],
    @Body() body: Record<string, string>,
  ) {
    return this.svc.preview(this.buildFileInputs(files), this.buildFields(body))
  }

  @Post('upload')
  @ApiOperation({ summary: 'Parse + persist uploaded cutting-plan .txt reports' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: UPLOAD_BODY_SCHEMA })
  @UseInterceptors(FilesInterceptor('files', 50, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(
    @UploadedFiles() files: MulterFile[],
    @Body() body: Record<string, string>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.upload(this.buildFileInputs(files), this.buildFields(body), user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List cutting plan uploads' })
  async list(@Query() query: QueryCuttingPlanDto) {
    return this.svc.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one cutting plan upload with its full parsed data' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Patch('order-parts/project-code')
  @ApiOperation({ summary: 'Bulk-assign a project_code to one or more order_part rows (any upload)' })
  async bulkAssignOrderPartProjectCode(@Body() dto: BulkAssignOrderPartProjectCodeDto) {
    return this.svc.bulkAssignOrderPartProjectCode(dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a cutting plan upload and all its parsed data' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }

  private buildFileInputs(files: MulterFile[] | undefined): CuttingPlanFileInput[] {
    if (!files?.length) throw new BadRequestException('No files uploaded')
    return files.map(f => ({ buffer: f.buffer, originalname: f.originalname }))
  }

  private buildFields(body: Record<string, string>): CuttingPlanUploadFields {
    return {
      project_code: body['project_code'],
      tag: body['tag'],
      description: body['description'],
      version: body['version'],
      revision: body['revision'],
    }
  }
}
