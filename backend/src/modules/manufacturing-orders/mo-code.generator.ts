import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * T-MO.06 · Race-safe MO code generator (P5).
 *
 * Format is MO-YYNNNNNN (2-digit year + 6-digit per-year counter, e.g.
 * MO-26000001) — changed 2026-09-28 from the flat MO-NNNNNN global counter
 * ("อยากให้ใส่ปีเข้าไปด้วย...รีใหม่เลย") so the code itself shows the year
 * an MO was created, resetting each year. `mo_code_seq` went from a single
 * row (id=1) to one row per year (PK `year`); the atomic upsert below
 * (`INSERT ... ON CONFLICT ... RETURNING`) allocates and increments in one
 * statement, so a brand-new year's first-ever MO is exactly as race-safe as
 * every one after it — no separate SELECT-then-INSERT window where two
 * concurrent first-of-the-year creates could collide.
 *
 * 2026-10-09 (user): an assembly MO's code shows its type — MO-F2600024
 * (Full shop) / MO-P2600024 (Pre-shop): F|P + 2-digit year + 5-digit counter
 * from the same per-year sequence. Without a type (MO Part) the old
 * MO-YYNNNNNN shape stays.
 *
 * Mirrors products/product-code.generator.ts. Accepts an optional transaction
 * client so the code is allocated inside the same tx that creates the MO row.
 */
@Injectable()
export class MoCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(tx?: Prisma.TransactionClient, shopType?: 'FULL_SHOP' | 'PRE_SHOP'): Promise<string> {
    const run = (client: Prisma.TransactionClient) => this.next(client, shopType)
    if (tx) return run(tx)
    return this.prisma.$transaction((client) => run(client))
  }

  private async next(tx: Prisma.TransactionClient, shopType?: 'FULL_SHOP' | 'PRE_SHOP'): Promise<string> {
    const year = new Date().getFullYear() % 100
    const rows = await tx.$queryRaw<{ allocated: number }[]>`
      INSERT INTO mo_code_seq (year, next_val) VALUES (${year}, 2)
      ON CONFLICT (year) DO UPDATE SET next_val = mo_code_seq.next_val + 1
      RETURNING next_val - 1 AS allocated
    `
    const n = rows[0].allocated
    const yy = year.toString().padStart(2, '0')
    if (shopType) return `MO-${shopType === 'FULL_SHOP' ? 'F' : 'P'}${yy}${n.toString().padStart(5, '0')}`
    return `MO-${yy}${n.toString().padStart(6, '0')}`
  }
}
