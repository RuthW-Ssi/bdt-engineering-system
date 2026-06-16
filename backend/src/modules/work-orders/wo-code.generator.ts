import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * T-WO.07 · Race-safe WO code generator (Q18).
 * `SELECT … FOR UPDATE` on the single-row work_order_code_seq locks the counter
 * for the duration of the surrounding transaction, so concurrent WO inserts
 * (incl. the auto-create fan-out on MO confirm) always get distinct sequential
 * codes (WO-00000001, WO-00000002, …).
 *
 * Mirrors manufacturing-orders/mo-code.generator.ts. 8-digit zero-padded because
 * 1 WO = 1 operation → many WOs per MO (Q18 rationale). Accepts an optional
 * transaction client so the code is allocated inside the same tx that creates
 * the WO row.
 */
@Injectable()
export class WoCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(tx?: Prisma.TransactionClient): Promise<string> {
    const run = (client: Prisma.TransactionClient) => this.next(client)
    if (tx) return run(tx)
    return this.prisma.$transaction((client) => run(client))
  }

  private async next(tx: Prisma.TransactionClient): Promise<string> {
    const seq = await tx.$queryRaw<{ next_val: number }[]>`
      SELECT next_val FROM work_order_code_seq WHERE id = 1 FOR UPDATE
    `
    const next = seq[0].next_val
    await tx.$executeRaw`
      UPDATE work_order_code_seq SET next_val = ${next + 1} WHERE id = 1
    `
    return `WO-${next.toString().padStart(8, '0')}`
  }
}
