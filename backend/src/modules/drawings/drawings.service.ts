import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'

@Injectable()
export class DrawingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  create(dto: CreateDrawingDto, uploadedById: number) {
    return this.prisma.drawing.create({
      data: {
        product_id: dto.product_id,
        file_key: dto.file_key,
        file_name: dto.file_name,
        mime_type: dto.mime_type,
        uploaded_by_id: uploadedById,
      },
    })
  }

  findByProduct(productId: number) {
    return this.prisma.drawing.findMany({
      where: { product_id: productId },
      orderBy: { create_date: 'desc' },
    })
  }

  async remove(id: number) {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } })
    if (!drawing) throw new NotFoundException(`Drawing ${id} not found`)
    await this.fileStorage.delete(drawing.file_key)
    return this.prisma.drawing.delete({ where: { id } })
  }
}
