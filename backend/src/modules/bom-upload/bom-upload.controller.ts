import {
  Controller, Get, Post, Param, Query, Body,
  UseInterceptors, UploadedFiles,
  ParseIntPipe, UseGuards, BadRequestException,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { BomUploadService, FileInput } from './bom-upload.service'
import { classifyFilename } from './filename-classifier'
import type { BomDocType } from './filename-classifier'
import { QueryDispatchDto } from './dto/dispatch.dto'
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

@ApiTags('bom-upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BomUploadController {
  constructor(private readonly svc: BomUploadService) {}

  @Post('bom/upload')
  @ApiOperation({ summary: 'Upload BOM files (Assembly List, Assembly Part List, Part List)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['project_id', 'zone_id', 'files', 'doc_types'],
      properties: {
        project_id: { type: 'integer' },
        zone_id: { type: 'integer' },
        sub_zone_id: { type: 'integer' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        doc_types: { type: 'array', items: { type: 'string', enum: ['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST'] } },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 3, { storage: memoryStorage() }))
  async upload(
    @UploadedFiles() files: MulterFile[],
    @Body() body: Record<string, string | string[]>,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded')

    const projectId = parseInt(String(body['project_id']), 10)
    const zoneId = parseInt(String(body['zone_id']), 10)
    const subZoneIdRaw = body['sub_zone_id']
    const subZoneId = subZoneIdRaw ? parseInt(String(subZoneIdRaw), 10) : null

    if (isNaN(projectId) || isNaN(zoneId)) {
      throw new BadRequestException('project_id and zone_id must be valid integers')
    }

    // doc_types may arrive as a single string or array
    const rawDocTypes = Array.isArray(body['doc_types']) ? body['doc_types'] : [body['doc_types']]

    const fileInputs: FileInput[] = files.map((f, i) => {
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

    return this.svc.upload(fileInputs, projectId, zoneId, subZoneId, user.sub)
  }

  @Get('dispatches')
  @ApiOperation({ summary: 'List BOM dispatches' })
  list(@Query() query: QueryDispatchDto) {
    return this.svc.list(query)
  }

  @Get('dispatches/:id')
  @ApiOperation({ summary: 'Get BOM dispatch detail' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get('dispatches/:id/revisions')
  @ApiOperation({ summary: 'Get revision history for a dispatch' })
  getRevisions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRevisions(id)
  }
}
