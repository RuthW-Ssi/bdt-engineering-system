import {
  Controller, Get, Post, Param, ParseIntPipe, Query, Body, UseGuards, BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { BimService } from './bim.service'
import { QueryBimModelsDto } from './dto/query-bim-models.dto'
import { QueryLatestBimVersionDto } from './dto/query-latest-bim-version.dto'
import { InitUploadDto } from './dto/init-upload.dto'
import { CompleteUploadDto } from './dto/complete-upload.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'

@ApiTags('bim')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bim-models')
export class BimController {
  constructor(private readonly svc: BimService) {}

  @Get()
  @ApiOperation({ summary: 'List uploaded BIM models, optionally scoped to a project' })
  list(@Query() query: QueryBimModelsDto) {
    return this.svc.list({ projectId: query.project_id })
  }

  @Get('latest-version')
  @ApiOperation({ summary: 'Latest major.minor version already uploaded for a project — null fields if none yet' })
  getLatestVersion(@Query() query: QueryLatestBimVersionDto) {
    return this.svc.getLatestVersion(query.project_id)
  }

  // Split into init/complete (rather than one multipart POST carrying the
  // file) so the actual bytes go straight from the browser to Autodesk's
  // signed S3 URL — never through this backend (or the Vercel rewrite in
  // front of it). Both have hard, non-configurable request-size ceilings
  // well under real IFC file sizes; confirmed 2026-07-21 this was the
  // actual cause of 413s on the deployed app despite our own 100MB limit.
  @Post('upload-init')
  @ApiOperation({ summary: 'Step 1: get a signed OSS upload URL — the browser PUTs the file directly to it, bypassing this backend' })
  initUpload(@Body() dto: InitUploadDto) {
    if (!dto.filename.toLowerCase().endsWith('.ifc')) {
      throw new BadRequestException('Only .ifc files are supported')
    }
    return this.svc.initUpload(dto.filename)
  }

  @Post('upload-complete')
  @ApiOperation({ summary: 'Step 2: call after the browser\'s direct PUT succeeds — creates the bim_model row and kicks off translation' })
  completeUpload(@Body() dto: CompleteUploadDto, @CurrentUser() user: JwtPayload) {
    return this.svc.completeUpload(
      user.sub, dto.project_id, dto.version_choice ?? 'minor', dto.filename, dto.object_key, dto.upload_key,
    )
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Check (and advance) translation status — poll this while status is "processing"' })
  getStatus(@Param('id', ParseIntPipe) id: number) {
    return this.svc.checkStatus(id)
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Re-run translation for an already-uploaded model (no re-upload needed)' })
  retry(@Param('id', ParseIntPipe) id: number) {
    return this.svc.retry(id)
  }

  @Get(':id/elements')
  @ApiOperation({ summary: 'List extracted elements (mark/weight/area/L·W·H/raw properties) for a model' })
  getElements(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getElements(id)
  }

  @Get(':id/viewer-token')
  @ApiOperation({ summary: 'Short-lived APS token + URN for the Autodesk Viewer SDK to load this model' })
  getViewerToken(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getViewerToken(id)
  }
}
