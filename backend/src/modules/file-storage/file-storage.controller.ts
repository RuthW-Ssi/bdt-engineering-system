import {
  Controller, Post, Get, Body, Query, Res, UploadedFile, UseInterceptors,
  BadRequestException, NotFoundException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { Response } from 'express'
import { diskStorage } from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import { FileStorageService } from './file-storage.service'

interface MulterFile {
  fieldname: string
  originalname: string
  encoding: string
  mimetype: string
  size: number
  path: string
  buffer?: Buffer
}

@ApiTags('file-storage')
@Controller('file-storage')
export class FileStorageController {
  constructor(private readonly svc: FileStorageService) {}

  @Post('presigned-upload')
  @ApiOperation({ summary: 'Get a presigned upload URL for a file' })
  @ApiBody({
    schema: {
      properties: {
        key: { type: 'string', example: 'drawings/DWG-001-A.pdf' },
        contentType: { type: 'string', example: 'application/pdf' },
      },
      required: ['key', 'contentType'],
    },
  })
  async presignedUpload(@Body() body: { key: string; contentType: string }) {
    if (!body.key || !body.contentType) {
      throw new BadRequestException('key and contentType are required')
    }
    const result = await this.svc.getUploadUrl(body.key, body.contentType)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    return { ...result, expires_at: expiresAt.toISOString() }
  }

  @Get('download')
  @ApiOperation({ summary: 'Download a file from local storage' })
  async download(@Query('key') key: string, @Res() res: Response) {
    if (!key) throw new BadRequestException('key query param is required')
    const absolutePath = this.svc.resolveLocalPath(key)
    if (!absolutePath.startsWith(this.svc.storageRoot())) {
      throw new BadRequestException('Invalid file key')
    }
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException(`File not found: ${key}`)
    }
    res.sendFile(absolutePath)
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file to local storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const storageRoot = process.env.FILE_STORAGE_LOCAL_PATH || './storage'
          const key = (_req.query as Record<string, string>).key ?? ''
          const dir = path.join(storageRoot, path.dirname(key))
          fs.mkdirSync(dir, { recursive: true })
          cb(null, dir)
        },
        filename: (_req, file, cb) => {
          const key = (_req.query as Record<string, string>).key ?? ''
          const basename = path.basename(key) || file.originalname
          cb(null, basename)
        },
      }),
    }),
  )
  upload(
    @Query('key') key: string,
    @UploadedFile() file: MulterFile,
  ) {
    if (!key) throw new BadRequestException('key query param is required')
    if (!file) throw new BadRequestException('No file uploaded')
    return {
      key,
      size: file.size,
      mimetype: file.mimetype,
      stored_path: file.path,
    }
  }
}
