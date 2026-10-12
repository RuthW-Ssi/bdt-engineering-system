import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { CreateDocumentDto, DocumentAudience, UpdateDocumentDto } from './dto/document.dto'

export interface UploadedPdf {
  originalname: string
  size: number
  buffer: Buffer
}

const SELECT = {
  id: true,
  title: true,
  category: true,
  audience: true,
  version: true,
  description: true,
  file_name: true,
  file_size: true,
  create_date: true,
  write_date: true,
  uploaded_by: { select: { id: true, name: true } },
} as const

// Which audiences a viewer may see — customers never see employee-only docs and vice
// versa; admin sees everything (they manage the customer manuals too).
export function visibleAudiences(user: { user_type?: string | null; role?: string } | null): DocumentAudience[] {
  if (user?.role === 'admin') return ['employee', 'customer', 'all']
  return user?.user_type === 'customer' ? ['customer', 'all'] : ['employee', 'all']
}

// multer/busboy decodes multipart filenames as latin1, which garbles Thai names.
const utf8FileName = (name: string) => Buffer.from(name, 'latin1').toString('utf8')

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  async list(userId: number) {
    return this.prisma.document.findMany({
      where: { audience: { in: await this.audiencesFor(userId) } },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      select: SELECT,
    })
  }

  async getFile(id: number, userId: number) {
    const doc = await this.prisma.document.findUnique({ where: { id } })
    // 404 (not 403) for a doc outside the viewer's audience — don't reveal it exists
    if (!doc || !(await this.audiencesFor(userId)).includes(doc.audience as DocumentAudience)) {
      throw new NotFoundException('Document not found')
    }
    return { buffer: await this.storage.getObject(doc.file_key), fileName: doc.file_name }
  }

  async create(dto: CreateDocumentDto, file: UploadedPdf | undefined, userId: number) {
    if (!file) throw new BadRequestException('A PDF file is required')
    const file_key = await this.store(file)
    return this.prisma.document.create({
      data: {
        title: dto.title.trim(),
        version: dto.version.trim(),
        category: dto.category?.trim() || 'user-manual',
        audience: dto.audience ?? 'employee',
        description: dto.description?.trim() || null,
        file_key,
        file_name: utf8FileName(file.originalname),
        file_size: file.size,
        uploaded_by_id: userId,
      },
      select: SELECT,
    })
  }

  // A new file replaces the old one in place — latest version only (wiki decision #4).
  async update(id: number, dto: UpdateDocumentDto, file: UploadedPdf | undefined, userId: number) {
    const existing = await this.prisma.document.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Document not found')
    const fileData = file
      ? { file_key: await this.store(file), file_name: utf8FileName(file.originalname), file_size: file.size, uploaded_by_id: userId }
      : {}
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        version: dto.version?.trim(),
        category: dto.category?.trim() || undefined,
        audience: dto.audience,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        ...fileData,
      },
      select: SELECT,
    })
    if (file) await this.deleteObject(existing.file_key)
    return updated
  }

  async remove(id: number) {
    const existing = await this.prisma.document.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Document not found')
    await this.prisma.document.delete({ where: { id } })
    await this.deleteObject(existing.file_key)
    return { id }
  }

  private async audiencesFor(userId: number): Promise<DocumentAudience[]> {
    return visibleAudiences(
      await this.prisma.res_users.findUnique({ where: { id: userId }, select: { user_type: true, role: true } }),
    )
  }

  // Checks the bytes, not the client-sent MIME type — only real PDFs get stored.
  private async store(file: UploadedPdf): Promise<string> {
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException('Only PDF files can be uploaded')
    }
    const key = `documents/${randomUUID()}.pdf`
    await this.storage.putObject(key, file.buffer, 'application/pdf')
    return key
  }

  // The row is already gone/replaced — a leftover object is harmless, so log instead of failing the request.
  private async deleteObject(key: string) {
    try {
      await this.storage.delete(key)
    } catch (err) {
      this.logger.warn(`Could not delete stored file ${key}: ${(err as Error).message}`)
    }
  }
}
