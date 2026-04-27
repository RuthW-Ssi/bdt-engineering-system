import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface DuplicateCandidate {
  id: number
  default_code: string
  name: string
  match_score: number
}

@Injectable()
export class DuplicateDetectorService {
  constructor(private readonly prisma: PrismaService) {}

  async detect(categ_id: number, attrs: Record<string, unknown>, excludeId?: number): Promise<DuplicateCandidate[]> {
    const grade = attrs['grade'] as string | undefined

    const candidates = await this.prisma.materials.findMany({
      where: {
        categ_id,
        active: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...(grade ? { attributes: { path: ['grade'], equals: grade } } : {}),
      },
      select: { id: true, default_code: true, name: true, attributes: true },
      take: 50,
    })

    const results: DuplicateCandidate[] = []
    for (const c of candidates) {
      const score = this.scoreMatch(attrs, c.attributes as Record<string, unknown>)
      if (score >= 0.7) {
        results.push({ id: c.id, default_code: c.default_code, name: c.name, match_score: score })
      }
    }
    return results.sort((a, b) => b.match_score - a.match_score)
  }

  private scoreMatch(a: Record<string, unknown>, b: Record<string, unknown>): number {
    const dimKeys = ['height_h', 'width_b', 'web_tw', 'flange_tf', 'thickness_t', 'diameter_d', 'lip_c', 'length_mm', 'width_mm']
    let total = 0
    let matched = 0

    for (const key of dimKeys) {
      const va = a[key] as number | undefined
      const vb = b[key] as number | undefined
      if (va === undefined && vb === undefined) continue
      total++
      if (va !== undefined && vb !== undefined) {
        const ratio = Math.abs(va - vb) / Math.max(va, vb)
        if (ratio <= 0.05) matched++   // ±5% tolerance
      }
    }

    if (total === 0) return a['grade'] === b['grade'] ? 0.7 : 0
    return matched / total
  }
}
