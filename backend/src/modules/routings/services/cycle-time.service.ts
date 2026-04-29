import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'

export interface ActivityCycleTime {
  activity_template_id: number
  description: string
  formula_param_code: string
  formula_expression: string
  input_value: number
  cycle_time_min: number
  manpower: number
  per_minute: number
  std_measure: number
}

export interface OperationCycleTime {
  routing_workcenter_id: number
  op_code: string
  workcenter_code: string
  workcenter_name: string
  activities: ActivityCycleTime[]
  total_cycle_time_min: number
}

export interface RoutingCycleTimeResult {
  product_id: number
  operations: OperationCycleTime[]
  total_cycle_time_min: number
  computed_at: Date
}

@Injectable()
export class CycleTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
  ) {}

  /**
   * Compute cycle time for the given product's routing operations.
   * productId: products.id
   * routingOpId: optional — if provided, compute only for that op; otherwise all ops for product
   */
  async compute(productId: number, force = false): Promise<RoutingCycleTimeResult> {
    const product = await this.prisma.products.findUnique({
      where: { id: productId },
      select: { id: true, attributes: true },
    })
    if (!product) throw new BadRequestException(`Product ${productId} not found`)

    const attrs = (product.attributes as Record<string, unknown>) ?? {}
    const numericAttrs = this.toNumericAttrs(attrs)

    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { product_id: productId },
      orderBy: { sequence: 'asc' },
      include: {
        workcenter: { select: { code: true, name: true } },
        activities: {
          orderBy: { sequence: 'asc' },
          include: {
            activity_template: {
              include: {
                formula_param: { select: { code: true, formula_expression: true } },
              },
            },
          },
        },
      },
    })

    if (ops.length === 0) {
      throw new BadRequestException(`No routing operations found for product ${productId}`)
    }

    const now = new Date()
    const operationResults: OperationCycleTime[] = []

    for (const op of ops) {
      const newCacheKey = this.buildCacheKey(product.id, op.id, attrs)

      // RT7: cache hit — skip recompute if attrs hash unchanged and not forced
      if (!force && op.cache_key === newCacheKey && Number(op.time_cycle) > 0) {
        operationResults.push({
          routing_workcenter_id: op.id,
          op_code: op.op_code,
          workcenter_code: op.workcenter.code,
          workcenter_name: op.workcenter.name,
          activities: op.activities.map(step => ({
            activity_template_id: step.activity_template_id,
            description: step.activity_template.description,
            formula_param_code: step.activity_template.formula_param_code,
            formula_expression: step.activity_template.formula_param.formula_expression,
            input_value: 0,
            cycle_time_min: Number(step.last_cycle_time_min ?? 0),
            manpower: Number(step.manpower_override ?? step.activity_template.manpower),
            per_minute: Number(step.per_minute_override ?? step.activity_template.per_minute),
            std_measure: Number(step.std_measure_override ?? step.activity_template.std_measure),
          })),
          total_cycle_time_min: Number(op.time_cycle),
        })
        continue
      }

      // Cache miss — compute fresh
      const activityResults: ActivityCycleTime[] = []

      for (const step of op.activities) {
        const tpl = step.activity_template
        const perMinute = Number(step.per_minute_override ?? tpl.per_minute)
        const stdMeasure = Number(step.std_measure_override ?? tpl.std_measure)
        const manpower = Number(step.manpower_override ?? tpl.manpower)
        const formulaExpr = tpl.formula_param.formula_expression

        let inputValue: number
        try {
          inputValue = this.formula.evaluate(formulaExpr, numericAttrs)
        } catch {
          inputValue = 0
        }

        const ratio = stdMeasure > 0 ? Math.ceil(inputValue / stdMeasure) : 1
        const cycleTime = ratio * perMinute * manpower

        activityResults.push({
          activity_template_id: tpl.id,
          description: tpl.description,
          formula_param_code: tpl.formula_param_code,
          formula_expression: formulaExpr,
          input_value: inputValue,
          cycle_time_min: cycleTime,
          manpower,
          per_minute: perMinute,
          std_measure: stdMeasure,
        })

        // RT7: write per-step cache
        await this.prisma.routing_step_activity.update({
          where: { id: step.id },
          data: {
            last_cycle_time_min: cycleTime,
            last_input_snapshot: { inputValue, formulaExpr },
            last_computed_at: now,
          },
        })
      }

      const opTotal = activityResults.reduce((sum, a) => sum + a.cycle_time_min, 0)
      operationResults.push({
        routing_workcenter_id: op.id,
        op_code: op.op_code,
        workcenter_code: op.workcenter.code,
        workcenter_name: op.workcenter.name,
        activities: activityResults,
        total_cycle_time_min: opTotal,
      })

      // RT7: write op-level cache key
      await this.prisma.mrp_routing_workcenter.update({
        where: { id: op.id },
        data: {
          time_cycle: opTotal,
          last_computed_at: now,
          cache_key: newCacheKey,
        },
      })
    }

    const totalMin = operationResults.reduce((sum, o) => sum + o.total_cycle_time_min, 0)
    return {
      product_id: productId,
      operations: operationResults,
      total_cycle_time_min: totalMin,
      computed_at: now,
    }
  }

  private toNumericAttrs(attrs: Record<string, unknown>): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [k, v] of Object.entries(attrs)) {
      const n = Number(v)
      if (!isNaN(n)) result[k] = n
    }
    return result
  }

  private buildCacheKey(productId: number, opId: number, attrs: Record<string, unknown>): string {
    const payload = JSON.stringify({ productId, opId, attrs })
    // Simple hash for cache key (no crypto dependency)
    let hash = 0
    for (let i = 0; i < payload.length; i++) {
      hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
  }
}
