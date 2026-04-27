import { Injectable, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class PartCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns a temporary pending code: <prefix5>-PEND (before warehouse assigns run number) */
  pendingCode(prefix5: string): string {
    return `${prefix5}-PEND`
  }

  /**
   * Atomically assign a permanent 10-digit code: <prefix5><NNNNN>
   * Uses SELECT FOR UPDATE to prevent concurrent duplicates.
   */
  async assignRunNumber(prefix5: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.$queryRaw<{ next_run: number }[]>`
        SELECT next_run FROM part_code_seq WHERE prefix_5 = ${prefix5} FOR UPDATE
      `
      if (!row.length) throw new ConflictException(`No seq row for prefix ${prefix5}`)
      const run = row[0].next_run
      await tx.$executeRaw`
        UPDATE part_code_seq SET next_run = next_run + 1 WHERE prefix_5 = ${prefix5}
      `
      const runStr = String(run).padStart(5, '0')
      return `${prefix5}${runStr}`
    })
  }

  isTemporary(code: string): boolean {
    return code.endsWith('-PEND')
  }
}
