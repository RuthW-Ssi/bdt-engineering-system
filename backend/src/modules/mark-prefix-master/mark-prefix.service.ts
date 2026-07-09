import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MoAllocationService } from '../manufacturing-orders/mo-allocation.service'

@Injectable()
export class MarkPrefixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alloc: MoAllocationService,
  ) {}

  async findAll(opts?: { category?: string; active?: boolean }) {
    return this.prisma.mark_prefix_master.findMany({
      where: {
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.active !== undefined ? { active: opts.active } : {}),
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    })
  }

  /**
   * T-MO.03 · MO form Section 1 grid data.
   * pending_bom_count = # of assemblies resolving to this prefix (P10) that
   * still have remaining qty to allocate. Tiles with count 0 are disabled.
   */
  async withPendingCount() {
    const prefixes = await this.prisma.mark_prefix_master.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    })
    // longest-first so greedy startsWith prefers the most specific code
    const codes = prefixes.map((p) => p.code).sort((a, b) => b.length - a.length)

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        assembly_mark: true,
        qty: true,
        product: { select: { mark_prefix: true } },
      },
    })
    const allocMap = await this.alloc.allocationMap()

    const counts = new Map<string, number>()
    for (const a of assemblies) {
      const remaining = Number(a.qty ?? 0) - (allocMap.get(a.id) ?? 0)
      if (remaining <= 0) continue
      const code = this.alloc.resolvePrefixCode(a, codes)
      if (!code) continue
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }

    return prefixes.map((p) => ({ ...p, pending_bom_count: counts.get(p.code) ?? 0 }))
  }
}
