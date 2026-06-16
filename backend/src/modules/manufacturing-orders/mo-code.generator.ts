import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * T-MO.06 · Race-safe MO code generator (P5).
 * `SELECT … FOR UPDATE` on the single-row mo_code_seq locks the counter for the
 * duration of the surrounding transaction, so concurrent POST /mo calls always
 * get distinct sequential codes (MO-00001, MO-00002, …).
 *
 * Mirrors products/product-code.generator.ts. Accepts an optional transaction
 * client so the code is allocated inside the same tx that creates the MO row.
 */
@Injectable()
export class MoCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(tx?: Prisma.TransactionClient): Promise<string> {
    const run = (client: Prisma.TransactionClient) => this.next(client)
    if (tx) return run(tx)
    return this.prisma.$transaction((client) => run(client))
  }

  private async next(tx: Prisma.TransactionClient): Promise<string> {
    const seq = await tx.$queryRaw<{ next_val: number }[]>`
      SELECT next_val FROM mo_code_seq WHERE id = 1 FOR UPDATE
    `
    const next = seq[0].next_val
    await tx.$executeRaw`
      UPDATE mo_code_seq SET next_val = ${next + 1} WHERE id = 1
    `
    return `MO-${next.toString().padStart(5, '0')}`
  }
}
