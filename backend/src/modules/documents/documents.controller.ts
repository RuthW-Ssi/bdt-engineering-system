import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AdminGuard } from '../../common/guards/admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CustomerAccessible } from '../../common/customer-scope/customer-accessible.decorator'
import type { JwtPayload } from '../auth/auth.service'
import { DocumentsService, UploadedPdf } from './documents.service'
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto'

const pdfUpload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  @CustomerAccessible({ global: true })
  @ApiOperation({ summary: 'List documents visible to the caller (filtered by audience)' })
  list(@CurrentUser() user: JwtPayload) {
    return this.svc.list(user.sub)
  }

  // @Res() instead of StreamableFile: the customer interceptor maps every response
  // through stripCustomerFields, which would turn a StreamableFile into a plain object.
  @Get(':id/file')
  @CustomerAccessible({ global: true })
  @ApiOperation({ summary: 'The document PDF, served inline' })
  async file(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { buffer, fileName } = await this.svc.getFile(id, user.sub)
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'X-Content-Type-Options': 'nosniff',
    })
    res.send(buffer)
  }

  @Post()
  @UseGuards(AdminGuard)
  @UseInterceptors(pdfUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new document (admin)' })
  create(@Body() dto: CreateDocumentDto, @UploadedFile() file: UploadedPdf | undefined, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, file, user.sub)
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @UseInterceptors(pdfUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Edit details and/or replace the file with a new version (admin)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @UploadedFile() file: UploadedPdf | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, file, user.sub)
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a document and its file (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }
}
