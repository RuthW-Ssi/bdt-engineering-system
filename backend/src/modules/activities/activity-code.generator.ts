import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ActivityCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ next_val: number }[]>`
        SELECT next_val FROM activity_code_seq WHERE id = 1 FOR UPDATE
      `
      if (!rows.length) throw new InternalServerErrorException('activity_code_seq row not found — run seed first')
      const val = rows[0].next_val
      await tx.$executeRaw`
        UPDATE activity_code_seq SET next_val = next_val + 1 WHERE id = 1
      `
      return `ACT-${String(val).padStart(5, '0')}`
    })
  }
}
