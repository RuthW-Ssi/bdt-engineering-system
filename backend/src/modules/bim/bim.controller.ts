import {
  Controller, Get, Post, Param, ParseIntPipe, Query, Body,
  UseInterceptors, UploadedFile, UseGuards, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { BimService } from './bim.service'
import { QueryBimModelsDto } from './dto/query-bim-models.dto'
import { QueryLatestBimVersionDto } from './dto/query-latest-bim-version.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'

interface MulterFile {
  originalname: string
  buffer: Buffer
}

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

  @Post()
  @ApiOperation({ summary: 'Upload an IFC file for a project — kicks off Autodesk Model Derivative translation' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'project_id'],
      properties: {
        file: { type: 'string', format: 'binary' },
        project_id: { type: 'integer' },
        version_choice: { type: 'string', enum: ['minor', 'major'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: MulterFile,
    @Body() body: Record<string, string>,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded')
    if (!file.originalname.toLowerCase().endsWith('.ifc')) {
      throw new BadRequestException('Only .ifc files are supported')
    }

    const projectId = parseInt(String(body['project_id']), 10)
    if (isNaN(projectId)) {
      throw new BadRequestException('project_id must be a valid integer')
    }
    const versionChoice = body['version_choice'] === 'major' ? 'major' : 'minor'

    return this.svc.upload(file, user.sub, projectId, versionChoice)
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
