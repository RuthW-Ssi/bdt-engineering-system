import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ProductLibraryCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<{ value: number }[]>`
        SELECT value FROM product_library_seq WHERE id = 1 FOR UPDATE
      `
      if (!seq.length) throw new InternalServerErrorException('product_library_seq row not found — run seed first')
      const next = seq[0].value + 1
      await tx.$executeRaw`
        UPDATE product_library_seq SET value = ${next} WHERE id = 1
      `
      return `LIB-${next.toString().padStart(3, '0')}`
    })
  }
}
