import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class MarkPrefixService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(opts?: { category?: string; active?: boolean }) {
    return this.prisma.mark_prefix_master.findMany({
      where: {
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.active !== undefined ? { active: opts.active } : {}),
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    })
  }
}
