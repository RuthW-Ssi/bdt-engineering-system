import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface ExplodedLine {
  level: number
  bom_id: number
  line_id: number
  ref_type: 'material' | 'sub_product'
  ref_id: number
  ref_code: string
  ref_name: string
  product_qty: number
  scrap_pct: number
  effective_qty: number
  weight_per_unit_kg?: number
  total_weight_kg?: number
}

export interface AggregatedLine {
  ref_type: 'material' | 'sub_product'
  ref_id: number
  ref_code: string
  ref_name: string
  total_effective_qty: number
  total_weight_kg?: number
}

const MAX_DEPTH = 10

@Injectable()
export class BomExplosionService {
  constructor(private readonly prisma: PrismaService) {}

  async explode(
    bomId: number,
    parentQty = 1,
    level = 0,
    visited: Set<number> = new Set(),
  ): Promise<ExplodedLine[]> {
    if (level >= MAX_DEPTH) {
      throw new BadRequestException(`BOM explosion exceeded max depth of ${MAX_DEPTH}`)
    }
    if (visited.has(bomId)) {
      throw new BadRequestException(`Circular BOM reference detected at bom_id=${bomId}`)
    }

    const bom = await this.prisma.product_bom.findUnique({
      where: { id: bomId },
      include: {
        lines: {
          include: {
            material: { select: { id: true, default_code: true, name: true } },
            sub_product: { select: { id: true, product_code: true, name: true } },
          },
          orderBy: { sequence: 'asc' },
        },
      },
    })

    if (!bom) return []

    visited.add(bomId)
    const result: ExplodedLine[] = []

    for (const line of bom.lines) {
      const lineQty = Number(line.product_qty)
      const scrapPct = Number(line.scrap_pct)
      const effectiveQty = parentQty * lineQty * (1 + scrapPct / 100)
      const weightPerUnit = line.weight_per_unit_kg ? Number(line.weight_per_unit_kg) : undefined
      const totalWeight = weightPerUnit !== undefined ? effectiveQty * weightPerUnit : undefined

      if (line.material_id && line.material) {
        result.push({
          level,
          bom_id: bomId,
          line_id: line.id,
          ref_type: 'material',
          ref_id: line.material.id,
          ref_code: line.material.default_code,
          ref_name: line.material.name,
          product_qty: lineQty,
          scrap_pct: scrapPct,
          effective_qty: effectiveQty,
          weight_per_unit_kg: weightPerUnit,
          total_weight_kg: totalWeight,
        })
      } else if (line.sub_product_id && line.sub_product) {
        const activeEbom = await this.prisma.product_bom.findFirst({
          where: {
            product_id: line.sub_product_id,
            bom_view: 'eBOM',
            state: 'active',
          },
        })

        if (!activeEbom) {
          result.push({
            level,
            bom_id: bomId,
            line_id: line.id,
            ref_type: 'sub_product',
            ref_id: line.sub_product.id,
            ref_code: line.sub_product.product_code,
            ref_name: line.sub_product.name,
            product_qty: lineQty,
            scrap_pct: scrapPct,
            effective_qty: effectiveQty,
            weight_per_unit_kg: weightPerUnit,
            total_weight_kg: totalWeight,
          })
        } else {
          const childVisited = new Set(visited)
          const childLines = await this.explode(activeEbom.id, effectiveQty, level + 1, childVisited)
          result.push(...childLines)
        }
      }
    }

    return result
  }

  aggregate(exploded: ExplodedLine[]): AggregatedLine[] {
    const map = new Map<string, AggregatedLine>()

    for (const line of exploded) {
      const key = `${line.ref_type}:${line.ref_id}`
      const existing = map.get(key)
      if (existing) {
        existing.total_effective_qty += line.effective_qty
        if (line.total_weight_kg !== undefined) {
          existing.total_weight_kg = (existing.total_weight_kg ?? 0) + line.total_weight_kg
        }
      } else {
        map.set(key, {
          ref_type: line.ref_type,
          ref_id: line.ref_id,
          ref_code: line.ref_code,
          ref_name: line.ref_name,
          total_effective_qty: line.effective_qty,
          total_weight_kg: line.total_weight_kg,
        })
      }
    }

    return Array.from(map.values())
  }
}
