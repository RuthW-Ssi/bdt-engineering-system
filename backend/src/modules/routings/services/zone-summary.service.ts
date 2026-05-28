import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'

export interface ZoneConsumableRow {
  resource_code: string
  resource_name: string
  unit: string | null
  consumption_basis: string | null
  total_qty: number | null
  breakdown: {
    assembly_mark: string
    assembly_qty: number
    qty_per_piece: number | null
    total_qty: number | null
  }[]
}

export interface ZoneWorkcenterRow {
  workcenter_code: string
  workcenter_name: string
  total_minutes: number
  breakdown: {
    assembly_mark: string
    assembly_qty: number
    minutes_per_piece: number
    total_minutes: number
  }[]
}

export interface AssemblyZoneSummary {
  assembly_id: number
  assembly_mark: string
  assembly_qty: number
  weight_kg: number | null
  surface_area_m2: number | null
  template_code: string | null
  consumables: { resource_code: string; resource_name: string; unit: string | null; qty_per_piece: number | null; total_qty: number | null }[]
  workcenter_times: { workcenter_code: string; workcenter_name: string; minutes_per_piece: number; total_minutes: number }[]
}

export interface ZoneSummaryDto {
  dispatch_id: number
  applied_count: number
  total_matched: number
  consumables: ZoneConsumableRow[]
  workcenter_times: ZoneWorkcenterRow[]
  by_assembly: AssemblyZoneSummary[]
}

@Injectable()
export class ZoneSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
  ) {}

  async compute(dispatchId: number): Promise<ZoneSummaryDto> {
    // Load all assemblies with product + custom routing
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: dispatchId, product_id: { not: null } },
      include: {
        product: {
          select: {
            id: true,
            attributes: true,
            has_custom_routing: true,
            custom_routing: {
              select: {
                id: true,
                cloned_from_template_id: true,
                ops: {
                  orderBy: { sequence: 'asc' },
                  include: {
                    workcenter: { select: { code: true, name: true } },
                    activities: {
                      orderBy: { sequence: 'asc' },
                      include: {
                        formula_param: { select: { code: true, formula_expression: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { assembly_mark: 'asc' },
    })

    const applied = assemblies.filter(a => a.product?.has_custom_routing && a.product?.custom_routing)
    const totalMatched = assemblies.filter(a => a.product_id != null).length

    // Bulk-load all distinct template IDs needed for consumables
    const templateIds = [...new Set(
      applied.map(a => a.product!.custom_routing!.cloned_from_template_id).filter(Boolean) as number[],
    )]

    const templateConsumableMap = new Map<number, Map<string, {
      resource_code: string; resource_name: string; unit: string | null
      consumption_basis: string | null; rate: number
    }>>()

    const templateCodeMap = new Map<number, string>()

    for (const tid of templateIds) {
      const tpl = await this.prisma.routing_template.findUnique({
        where: { id: tid },
        select: {
          code: true,
          operations: {
            orderBy: { sequence: 'asc' },
            select: {
              op_activities: {
                orderBy: { sequence: 'asc' },
                select: {
                  consumables: {
                    select: {
                      qty: true,
                      unit: true,
                      consumption_basis: true,
                      resource: { select: { code: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
      if (!tpl) continue
      templateCodeMap.set(tid, tpl.code)

      // Aggregate consumable rates across all ops/activities in the template
      const consMap = new Map<string, { resource_code: string; resource_name: string; unit: string | null; consumption_basis: string | null; rate: number }>()
      for (const op of tpl.operations) {
        for (const act of op.op_activities) {
          for (const c of act.consumables) {
            const rate = c.qty != null ? Number(c.qty) : null
            if (!rate) continue
            const existing = consMap.get(c.resource.code)
            if (existing) {
              existing.rate += rate
            } else {
              consMap.set(c.resource.code, {
                resource_code: c.resource.code,
                resource_name: c.resource.name,
                unit: c.unit,
                consumption_basis: c.consumption_basis,
                rate,
              })
            }
          }
        }
      }
      templateConsumableMap.set(tid, consMap)
    }

    // Per-assembly calculations
    const zoneConsumableMap = new Map<string, ZoneConsumableRow>()
    const zoneWorkcenterMap = new Map<string, ZoneWorkcenterRow>()
    const byAssembly: AssemblyZoneSummary[] = []

    for (const asm of applied) {
      const product = asm.product!
      const cr = product.custom_routing!
      const templateId = cr.cloned_from_template_id
      const asmQty = Number(asm.qty ?? 1)
      const areaM2 = asm.surface_area_m2 != null ? Number(asm.surface_area_m2) : null
      const weightKg = asm.weight_kg != null ? Number(asm.weight_kg) : null

      const attrs = (product.attributes as Record<string, unknown>) ?? {}
      const numericAttrs = this.toNumericAttrs(attrs)

      // Consumables from template
      const asmConsumables: AssemblyZoneSummary['consumables'] = []
      if (templateId) {
        const consMap = templateConsumableMap.get(templateId)
        if (consMap) {
          for (const c of consMap.values()) {
            const qtyPerPiece = this.calcConsumableQty(c.rate, c.consumption_basis, areaM2, weightKg)
            const totalQty = qtyPerPiece != null ? qtyPerPiece * asmQty : null
            asmConsumables.push({ resource_code: c.resource_code, resource_name: c.resource_name, unit: c.unit, qty_per_piece: qtyPerPiece, total_qty: totalQty })

            const existing = zoneConsumableMap.get(c.resource_code)
            if (existing) {
              existing.total_qty = totalQty != null ? (existing.total_qty ?? 0) + totalQty : existing.total_qty
              existing.breakdown.push({ assembly_mark: asm.assembly_mark, assembly_qty: asmQty, qty_per_piece: qtyPerPiece, total_qty: totalQty })
            } else {
              zoneConsumableMap.set(c.resource_code, {
                resource_code: c.resource_code,
                resource_name: c.resource_name,
                unit: c.unit,
                consumption_basis: c.consumption_basis,
                total_qty: totalQty,
                breakdown: [{ assembly_mark: asm.assembly_mark, assembly_qty: asmQty, qty_per_piece: qtyPerPiece, total_qty: totalQty }],
              })
            }
          }
        }
      }

      // Timing from custom routing
      const asmWorkcenterTimes: AssemblyZoneSummary['workcenter_times'] = []
      for (const op of cr.ops) {
        let minutesPerPiece = 0
        for (const act of op.activities) {
          const perMinute = Number(act.per_minute)
          const stdMeasure = Number(act.std_measure)
          const manpower = Number(act.manpower)
          let inputValue = 0
          try {
            inputValue = this.formula.evaluate(act.formula_param.formula_expression, numericAttrs)
          } catch { /* fallback 0 */ }
          const ratio = stdMeasure > 0 ? Math.ceil(inputValue / stdMeasure) : 1
          minutesPerPiece += ratio * perMinute * manpower
        }
        const totalMinutes = minutesPerPiece * asmQty
        asmWorkcenterTimes.push({ workcenter_code: op.workcenter.code, workcenter_name: op.workcenter.name, minutes_per_piece: minutesPerPiece, total_minutes: totalMinutes })

        const existing = zoneWorkcenterMap.get(op.workcenter.code)
        if (existing) {
          existing.total_minutes += totalMinutes
          existing.breakdown.push({ assembly_mark: asm.assembly_mark, assembly_qty: asmQty, minutes_per_piece: minutesPerPiece, total_minutes: totalMinutes })
        } else {
          zoneWorkcenterMap.set(op.workcenter.code, {
            workcenter_code: op.workcenter.code,
            workcenter_name: op.workcenter.name,
            total_minutes: totalMinutes,
            breakdown: [{ assembly_mark: asm.assembly_mark, assembly_qty: asmQty, minutes_per_piece: minutesPerPiece, total_minutes: totalMinutes }],
          })
        }
      }

      byAssembly.push({
        assembly_id: asm.id,
        assembly_mark: asm.assembly_mark,
        assembly_qty: asmQty,
        weight_kg: weightKg,
        surface_area_m2: areaM2,
        template_code: templateId ? (templateCodeMap.get(templateId) ?? null) : null,
        consumables: asmConsumables,
        workcenter_times: asmWorkcenterTimes,
      })
    }

    return {
      dispatch_id: dispatchId,
      applied_count: applied.length,
      total_matched: totalMatched,
      consumables: [...zoneConsumableMap.values()],
      workcenter_times: [...zoneWorkcenterMap.values()],
      by_assembly: byAssembly,
    }
  }

  private calcConsumableQty(
    rate: number,
    basis: string | null,
    areaM2: number | null,
    weightKg: number | null,
  ): number | null {
    if (basis === 'per_m2') return areaM2 != null ? rate * areaM2 : null
    if (basis === 'per_kg') return weightKg != null ? rate * weightKg : null
    return rate // per_unit or null → rate × 1 per piece
  }

  private toNumericAttrs(attrs: Record<string, unknown>): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [k, v] of Object.entries(attrs)) {
      const n = Number(v)
      if (!isNaN(n)) result[k] = n
    }
    return result
  }
}
