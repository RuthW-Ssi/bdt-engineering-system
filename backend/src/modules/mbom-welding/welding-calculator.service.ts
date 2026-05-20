import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { WeldingCoverageDto, WeldingMbomSummaryDto, WeldingSkippedPartDto, WeldingSkipReason } from './dto/welding-mbom-response.dto'

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

const STEEL_DENSITY = 7.85
const DEPOSITION_EFF = 0.90
const TAK_INTERVAL_M = 0.5
const TAK_LENGTH_M = 0.05
const DEFAULT_FILLET_MM = 6
const DEFAULT_SIDES = 2
const DEFAULT_WELD_LAYERS = 1

@Injectable()
export class WeldingCalculatorService {
  private readonly logger = new Logger(WeldingCalculatorService.name)

  constructor(private readonly prisma: PrismaService) {}

  async compute(dispatchId: number): Promise<void> {

    const configs = await this.prisma.dispatch_assembly_welding_config.findMany({
      where: { dispatch_id: dispatchId, material_id: { not: null } },
      select: {
        assembly_id: true,
        material_id: true,
        fillet_mm: true,
        sides: true,
        weld_layers: true,
        assembly: {
          select: {
            assembly_mark: true,
            qty: true,
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

    let totalParts = 0
    let calculated = 0
    let excludedTaF = 0
    const skippedParts: WeldingSkippedPartDto[] = []

    const skip = (assemblyMark: string, partMark: string, reason: WeldingSkipReason, profile?: string | null) => {
      skippedParts.push({ assembly_mark: assemblyMark, part_mark: partMark, reason, profile: profile ?? null })
    }

    for (const cfg of configs) {
      const attrs = cfg.material!.attributes as Record<string, unknown>
      const pkgKg = Math.max(Number(attrs['pkg_kg'] ?? 15), 0.001)
      const asmMark = cfg.assembly.assembly_mark

      let assemblyPathM = 0
      for (const ap of cfg.assembly.assembly_parts) {
        totalParts++
        const partQty = Number(ap.qty ?? 1)
        const partType = classifyPartType(ap.part.part_mark)

        if (partType === 'TA-f') { excludedTaF++; continue }

        let pathM = 0
        if (partType === 'TA-w') {
          const len = ap.part.length_mm ? Number(ap.part.length_mm) : null
          if (len === null) { skip(asmMark, ap.part.part_mark, 'no_length_mm', ap.part.profile); continue }
          pathM = len * 4 / 1000
        } else if (partType === 'TA-m') {
          const perimeter = parsePerimeter(ap.part.profile)
          if (perimeter === null) { skip(asmMark, ap.part.part_mark, 'profile_unparseable', ap.part.profile); continue }
          pathM = perimeter / 1000
        } else if (partType === 'TA-p') {
          const width = parseWidth(ap.part.profile)
          const len = ap.part.length_mm ? Number(ap.part.length_mm) : null
          if (width === null || len === null) {
            const reason: WeldingSkipReason = !ap.part.profile ? 'no_profile' : 'profile_unparseable'
            skip(asmMark, ap.part.part_mark, reason, ap.part.profile)
            continue
          }
          pathM = (width + len) * 2 / 1000 * 0.75
        } else {
          const perimeter = parsePerimeter(ap.part.profile)
          if (perimeter === null) {
            const reason: WeldingSkipReason = !ap.part.profile ? 'no_profile' : 'profile_unparseable'
            skip(asmMark, ap.part.part_mark, reason, ap.part.profile)
            continue
          }
          pathM = perimeter / 1000
        }

        calculated++
        assemblyPathM += pathM * partQty
      }

      const asmQty = cfg.assembly.qty ? Number(cfg.assembly.qty) : 1
      const filletMm = cfg.fillet_mm ? Number(cfg.fillet_mm) : DEFAULT_FILLET_MM
      const sides = cfg.sides ?? DEFAULT_SIDES
      const weldLayers = cfg.weld_layers ?? DEFAULT_WELD_LAYERS
      const consumptionRate = (filletMm ** 2 / 200) * 100 * sides * weldLayers * STEEL_DENSITY / DEPOSITION_EFF / 1000

      const takPoints = assemblyPathM / TAK_INTERVAL_M + 4
      const effectiveLengthM = assemblyPathM + takPoints * TAK_LENGTH_M
      const consumptionKg = effectiveLengthM * consumptionRate * asmQty

      const matId = cfg.material_id!
      const prev = acc.get(matId) ?? { total_path_m: 0, total_consumption_kg: 0, pkg_kg: pkgKg }
      acc.set(matId, {
        total_path_m: prev.total_path_m + assemblyPathM * asmQty,
        total_consumption_kg: prev.total_consumption_kg + consumptionKg,
        pkg_kg: pkgKg,
      })
    }

    const calculable = calculated + skippedParts.length
    const coverage: WeldingCoverageDto = {
      total_parts: totalParts,
      calculated,
      excluded_ta_f: excludedTaF,
      skipped: skippedParts.length,
      coverage_pct: calculable > 0 ? Math.round((calculated / calculable) * 1000) / 10 : 100,
      skipped_parts: skippedParts,
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
      this.prisma.bom_dispatch.update({
        where: { id: dispatchId },
        data: { welding_coverage_json: coverage as object },
      }),
    ])
  }

  async getMbom(dispatchId: number): Promise<WeldingMbomSummaryDto> {
    const [rows, dispatch, cfgRows] = await Promise.all([
      this.prisma.dispatch_welding_requirement.findMany({
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
      }),
      this.prisma.bom_dispatch.findUnique({
        where: { id: dispatchId },
        select: { welding_coverage_json: true },
      }),
      this.prisma.dispatch_assembly_welding_config.findMany({
        where: { dispatch_id: dispatchId, material_id: { not: null } },
        select: {
          material_id: true,
          fillet_mm: true,
          sides: true,
          weld_layers: true,
          assembly: { select: { id: true, assembly_mark: true, qty: true } },
        },
        orderBy: { assembly: { assembly_mark: 'asc' } },
      }),
    ])

    // assembly breakdown map: material_id → breakdown rows
    type AsmSpec = { assembly_id: number; assembly_mark: string; asm_qty: number; fillet_mm: number; sides: number; weld_layers: number; rate_kg_per_m: number }
    const breakdownMap = new Map<number, AsmSpec[]>()
    for (const cfg of cfgRows) {
      if (!cfg.material_id) continue
      const fillet = cfg.fillet_mm ? Number(cfg.fillet_mm) : DEFAULT_FILLET_MM
      const sides = cfg.sides ?? DEFAULT_SIDES
      const weld_layers = cfg.weld_layers ?? DEFAULT_WELD_LAYERS
      const rate = Math.round(((fillet ** 2 / 200) * 100 * sides * weld_layers * STEEL_DENSITY / DEPOSITION_EFF / 1000) * 10000) / 10000
      const asm_qty = cfg.assembly.qty ? Number(cfg.assembly.qty) : 1
      if (!breakdownMap.has(cfg.material_id)) breakdownMap.set(cfg.material_id, [])
      breakdownMap.get(cfg.material_id)!.push({
        assembly_id: cfg.assembly.id,
        assembly_mark: cfg.assembly.assembly_mark,
        asm_qty,
        fillet_mm: fillet,
        sides,
        weld_layers,
        rate_kg_per_m: rate,
      })
    }

    const computedAt = rows[0]?.computed_at?.toISOString() ?? null

    const items = rows.map(r => ({
      material_id: r.material_id,
      material_name: r.material.name,
      default_code: r.material.default_code,
      uom: r.material.uom?.name ?? null,
      total_path_m: Number(r.total_path_m),
      total_consumption_kg: Number(r.total_consumption_kg),
      total_packages: r.total_packages,
      assembly_breakdown: breakdownMap.get(r.material_id) ?? [],
    }))

    return {
      dispatch_id: dispatchId,
      computed_at: computedAt,
      items,
      grand_total_consumption_kg: items.reduce((s, i) => s + i.total_consumption_kg, 0),
      grand_total_packages: items.reduce((s, i) => s + i.total_packages, 0),
      coverage: (dispatch?.welding_coverage_json as unknown as WeldingCoverageDto) ?? null,
    }
  }
}
