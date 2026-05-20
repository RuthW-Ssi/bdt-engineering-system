import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MbomByTypeDto, MbomSummaryDto } from './dto/mbom-response.dto'

const PAINT_TYPE_ORDER = ['primer', 'intermediate', 'fireproof', 'topcoat']

@Injectable()
export class PaintCalculatorService {
  private readonly logger = new Logger(PaintCalculatorService.name)

  constructor(private readonly prisma: PrismaService) {}

  async compute(dispatchId: number): Promise<void> {
    const configs = await this.prisma.dispatch_assembly_paint_config.findMany({
      where: { dispatch_id: dispatchId, material_id: { not: null } },
      include: {
        assembly: { select: { surface_area_m2: true, qty: true } },
        material: { select: { id: true, attributes: true } },
      },
    })

    type AccRow = { material_id: number; paint_type: string; area: number; gallons: number }
    const acc = new Map<string, AccRow>()

    for (const cfg of configs) {
      const area = Number(cfg.assembly.surface_area_m2 ?? 0)
      if (area <= 0) {
        this.logger.warn(`assembly ${cfg.assembly_id} has no surface_area_m2 — skipping`)
        continue
      }
      const asmQty = Number(cfg.assembly.qty ?? 1)
      const attrs = cfg.material!.attributes as Record<string, unknown>
      const coverage = Math.max(Number(attrs['coverage_sqm_per_gallon'] ?? 1), 0.001)
      if (isNaN(coverage)) {
        this.logger.warn(`material ${cfg.material_id} has invalid coverage — skipping`)
        continue
      }

      const rowArea = area * asmQty
      const rowGallons = (rowArea * cfg.layers) / coverage
      const key = `${cfg.material_id}__${cfg.paint_type}`
      const existing = acc.get(key)
      if (existing) {
        existing.area += rowArea
        existing.gallons += rowGallons
      } else {
        acc.set(key, { material_id: cfg.material_id!, paint_type: cfg.paint_type, area: rowArea, gallons: rowGallons })
      }
    }

    await this.prisma.$transaction([
      this.prisma.dispatch_material_requirement.deleteMany({ where: { dispatch_id: dispatchId } }),
      this.prisma.dispatch_material_requirement.createMany({
        data: [...acc.values()].map(r => ({
          dispatch_id: dispatchId,
          material_id: r.material_id,
          paint_type: r.paint_type,
          total_area_m2: r.area,
          total_qty_gallon: r.gallons,
          computed_at: new Date(),
        })),
      }),
    ])
  }

  async getMbom(dispatchId: number): Promise<MbomSummaryDto> {
    const [rows, cfgRows] = await Promise.all([
      this.prisma.dispatch_material_requirement.findMany({
        where: { dispatch_id: dispatchId },
        include: { material: { select: { name: true, attributes: true } } },
        orderBy: { paint_type: 'asc' },
      }),
      this.prisma.dispatch_assembly_paint_config.findMany({
        where: { dispatch_id: dispatchId, material_id: { not: null } },
        select: {
          material_id: true,
          paint_type: true,
          layers: true,
          assembly: { select: { id: true, assembly_mark: true, surface_area_m2: true, qty: true } },
        },
        orderBy: { assembly: { assembly_mark: 'asc' } },
      }),
    ])

    // material params lookup
    const coverageMap = new Map<number, number>()
    const micronMap = new Map<number, number>()
    for (const r of rows) {
      const attrs = r.material.attributes as Record<string, unknown>
      coverageMap.set(r.material_id, Math.max(Number(attrs['coverage_sqm_per_gallon'] ?? 5), 0.001))
      micronMap.set(r.material_id, Number(attrs['paint_micron'] ?? 50))
    }

    // per-assembly breakdown map: `${materialId}__${paintType}` → rows
    type AsmBreak = { assembly_id: number; assembly_mark: string; area_m2: number; qty: number; layers: number; gallons: number }
    const breakdownMap = new Map<string, AsmBreak[]>()
    for (const cfg of cfgRows) {
      if (!cfg.material_id) continue
      const area = Number(cfg.assembly.surface_area_m2 ?? 0)
      const qty = Number(cfg.assembly.qty ?? 1)
      const coverage = coverageMap.get(cfg.material_id) ?? 5
      const key = `${cfg.material_id}__${cfg.paint_type}`
      if (!breakdownMap.has(key)) breakdownMap.set(key, [])
      breakdownMap.get(key)!.push({
        assembly_id: cfg.assembly.id,
        assembly_mark: cfg.assembly.assembly_mark,
        area_m2: area,
        qty,
        layers: cfg.layers,
        gallons: (area * qty * cfg.layers) / coverage,
      })
    }

    const latestRow = rows.reduce<Date | null>((acc, r) => {
      const t = r.computed_at
      return !acc || t > acc ? t : acc
    }, null)

    const grouped = new Map<string, { items: typeof rows; subtotal: number }>()
    for (const r of rows) {
      const entry = grouped.get(r.paint_type) ?? { items: [], subtotal: 0 }
      entry.items.push(r)
      entry.subtotal += Number(r.total_qty_gallon)
      grouped.set(r.paint_type, entry)
    }

    const by_paint_type: MbomByTypeDto[] = PAINT_TYPE_ORDER.filter(pt => grouped.has(pt)).map(pt => {
      const { items, subtotal } = grouped.get(pt)!
      return {
        paint_type: pt,
        items: items.map(r => ({
          material_id: r.material_id,
          material_name: r.material.name,
          paint_type: r.paint_type,
          total_area_m2: Number(r.total_area_m2),
          total_qty_gallon: Number(r.total_qty_gallon),
          micron: micronMap.get(r.material_id) ?? 50,
          coverage_sqm_per_gallon: coverageMap.get(r.material_id) ?? 5,
          assembly_breakdown: breakdownMap.get(`${r.material_id}__${r.paint_type}`) ?? [],
        })),
        subtotal_gallon: subtotal,
      }
    })

    return {
      dispatch_id: dispatchId,
      computed_at: latestRow?.toISOString() ?? null,
      by_paint_type,
      grand_total_gallon: by_paint_type.reduce((s, g) => s + g.subtotal_gallon, 0),
    }
  }
}
