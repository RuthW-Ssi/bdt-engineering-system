import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type ProductKind = 'STD' | 'CUS'

@Injectable()
export class ProductCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(kind: ProductKind): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<{ next_run: number }[]>`
        SELECT next_run FROM product_code_seq
        WHERE kind = ${kind}
        FOR UPDATE
      `
      const next = seq[0].next_run
      await tx.$executeRaw`
        UPDATE product_code_seq SET next_run = ${next + 1}
        WHERE kind = ${kind}
      `
      return `${kind}-${next.toString().padStart(5, '0')}`
    })
  }
}
