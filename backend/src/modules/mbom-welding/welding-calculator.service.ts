import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { WeldingMbomSummaryDto } from './dto/welding-mbom-response.dto'

export type WeldingPartType = 'TA-w' | 'TA-f' | 'TA-m' | 'TA-p' | 'unknown'

export function classifyPartType(partMark: string): WeldingPartType {
  if (/-F-/i.test(partMark)) return 'TA-f'
  if (/-M-/i.test(partMark)) return 'TA-m'
  if (/-P-/i.test(partMark)) return 'TA-p'
  if (/-W-/i.test(partMark) || /W\d*$/i.test(partMark)) return 'TA-w'
  return 'unknown'
}

function parsePerimeter(profile: string | null): number | null {
  if (!profile) return null
  const p = profile.trim().toUpperCase()

  const hOrC = p.match(/^[HC]\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (hOrC) return 2 * (parseFloat(hOrC[1]) + parseFloat(hOrC[2]))

  const angle = p.match(/^L\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (angle) return 2 * (parseFloat(angle[1]) + parseFloat(angle[2]))

  const chs = p.match(/^(?:CHS|PIPE)\s*(\d+(?:\.\d+)?)/)
  if (chs) return Math.PI * parseFloat(chs[1])

  const rhs = p.match(/^RHS\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (rhs) return 2 * (parseFloat(rhs[1]) + parseFloat(rhs[2]))

  const shs = p.match(/^SHS\s*(\d+(?:\.\d+)?)/)
  if (shs) return 4 * parseFloat(shs[1])

  const rod = p.match(/^(?:ROD\s*)?(?:RODRB|RB)\s*(\d+(?:\.\d+)?)/)
  if (rod) return Math.PI * parseFloat(rod[1])

  return null
}

function parseWidth(profile: string | null): number | null {
  if (!profile) return null
  const p = profile.trim().toUpperCase()
  const plate = p.match(/^(?:PL|PLT)\s*\d+(?:\.\d+)?[X*×](\d+(?:\.\d+)?)/)
  if (plate) return parseFloat(plate[1])
  return null
}

@Injectable()
export class WeldingCalculatorService {
  private readonly logger = new Logger(WeldingCalculatorService.name)

  constructor(private readonly prisma: PrismaService) {}

  async compute(dispatchId: number): Promise<void> {
    const FILLET_MM = 6
    const SIDES = 2
    const LAYERS = 1
    const STEEL_DENSITY = 7.85
    const DEPOSITION_EFF = 0.90
    const TAK_INTERVAL_M = 0.5
    const TAK_LENGTH_M = 0.05
    const CONSUMPTION_RATE = (FILLET_MM ** 2 / 200) * 100 * SIDES * LAYERS * STEEL_DENSITY / DEPOSITION_EFF / 1000

    const configs = await this.prisma.dispatch_assembly_welding_config.findMany({
      where: { dispatch_id: dispatchId, material_id: { not: null } },
      select: {
        assembly_id: true,
        material_id: true,
        assembly: {
          select: {
            assembly_parts: {
              select: {
                qty: true,
                part: { select: { part_mark: true, profile: true, length_mm: true } },
              },
            },
          },
        },
        material: { select: { attributes: true } },
      },
    })

    const acc = new Map<number, { total_path_m: number; total_consumption_kg: number; pkg_kg: number }>()

    for (const cfg of configs) {
      const attrs = cfg.material!.attributes as Record<string, unknown>
      const pkgKg = Math.max(Number(attrs['pkg_kg'] ?? 15), 0.001)

      // sum path_m across all parts in this assembly
      let assemblyPathM = 0
      for (const ap of cfg.assembly.assembly_parts) {
        const partQty = Number(ap.qty ?? 1)
        const partType = classifyPartType(ap.part.part_mark)

        if (partType === 'TA-f') continue

        let pathM = 0
        if (partType === 'TA-w') {
          const len = ap.part.length_mm ? Number(ap.part.length_mm) : null
          if (len === null) { this.logger.warn(`TA-w part ${ap.part.part_mark} has no length_mm`); continue }
          pathM = len * 4 / 1000
        } else if (partType === 'TA-m') {
          const perimeter = parsePerimeter(ap.part.profile)
          if (perimeter === null) { this.logger.warn(`TA-m part ${ap.part.part_mark} profile unparseable: ${ap.part.profile}`); continue }
          pathM = perimeter / 1000
        } else if (partType === 'TA-p') {
          const width = parseWidth(ap.part.profile)
          const len = ap.part.length_mm ? Number(ap.part.length_mm) : null
          if (width === null || len === null) { this.logger.warn(`TA-p part ${ap.part.part_mark} missing width/length`); continue }
          pathM = (width + len) * 2 / 1000 * 0.75
        } else {
          const perimeter = parsePerimeter(ap.part.profile)
          if (perimeter === null) { this.logger.warn(`Unknown type for ${ap.part.part_mark}, skipping`); continue }
          pathM = perimeter / 1000
        }

        assemblyPathM += pathM * partQty
      }

      const takPoints = assemblyPathM / TAK_INTERVAL_M + 4
      const effectiveLengthM = assemblyPathM + takPoints * TAK_LENGTH_M
      const consumptionKg = effectiveLengthM * CONSUMPTION_RATE

      const matId = cfg.material_id!
      const prev = acc.get(matId) ?? { total_path_m: 0, total_consumption_kg: 0, pkg_kg: pkgKg }
      acc.set(matId, {
        total_path_m: prev.total_path_m + assemblyPathM,
        total_consumption_kg: prev.total_consumption_kg + consumptionKg,
        pkg_kg: pkgKg,
      })
    }

    await this.prisma.$transaction([
      this.prisma.dispatch_welding_requirement.deleteMany({ where: { dispatch_id: dispatchId } }),
      this.prisma.dispatch_welding_requirement.createMany({
        data: Array.from(acc.entries()).map(([matId, v]) => ({
          dispatch_id: dispatchId,
          material_id: matId,
          total_path_m: v.total_path_m,
          total_consumption_kg: v.total_consumption_kg,
          total_packages: Math.ceil(v.total_consumption_kg / v.pkg_kg),
          computed_at: new Date(),
        })),
      }),
    ])
  }

  async getMbom(dispatchId: number): Promise<WeldingMbomSummaryDto> {
    const rows = await this.prisma.dispatch_welding_requirement.findMany({
      where: { dispatch_id: dispatchId },
      orderBy: { material_id: 'asc' },
      select: {
        material_id: true,
        total_path_m: true,
        total_consumption_kg: true,
        total_packages: true,
        computed_at: true,
        material: { select: { name: true, default_code: true, uom: { select: { name: true } } } },
      },
    })

    const computedAt = rows[0]?.computed_at?.toISOString() ?? null

    const items = rows.map(r => ({
      material_id: r.material_id,
      material_name: r.material.name,
      default_code: r.material.default_code,
      uom: r.material.uom?.name ?? null,
      total_path_m: Number(r.total_path_m),
      total_consumption_kg: Number(r.total_consumption_kg),
      total_packages: r.total_packages,
    }))

    return {
      dispatch_id: dispatchId,
      computed_at: computedAt,
      items,
      grand_total_consumption_kg: items.reduce((s, i) => s + i.total_consumption_kg, 0),
      grand_total_packages: items.reduce((s, i) => s + i.total_packages, 0),
    }
  }
}
