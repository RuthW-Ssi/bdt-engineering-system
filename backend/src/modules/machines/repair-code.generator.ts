import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Prisma } from '@prisma/client'

type TxClient = Prisma.TransactionClient

@Injectable()
export class RepairCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(tx?: TxClient): Promise<string> {
    const run = async (client: TxClient | PrismaService) => {
      const rows = await (client as any).$queryRaw<{ next_val: number }[]>`
        SELECT next_val FROM repair_ticket_seq WHERE id = 1 FOR UPDATE
      `
      if (!rows.length)
        throw new InternalServerErrorException('repair_ticket_seq row not found — run seed first')
      const val = rows[0].next_val
      await (client as any).$executeRaw`
        UPDATE repair_ticket_seq SET next_val = next_val + 1 WHERE id = 1
      `
      return `RPR-${String(val).padStart(5, '0')}`
    }
    if (tx) return run(tx)
    return this.prisma.$transaction((innerTx: TxClient) => run(innerTx))
  }
}
