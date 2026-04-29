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

  async compute(productId: number, force = false): Promise<RoutingCycleTimeResult> {
    const product = await this.prisma.products.findUnique({
      where: { id: productId },
      select: { id: true, attributes: true, routing_template_id: true, has_custom_routing: true },
    })
    if (!product) throw new BadRequestException(`Product ${productId} not found`)

    if (product.has_custom_routing) return this.computeCustomRouting(product, force)
    if (product.routing_template_id) return this.computeFromTemplate(product, force)
    throw new BadRequestException('Product has no routing bound')
  }

  private async computeFromTemplate(
    product: { id: number; attributes: unknown; routing_template_id: number | null },
    force: boolean,
  ): Promise<RoutingCycleTimeResult> {
    const attrs = (product.attributes as Record<string, unknown>) ?? {}
    const numericAttrs = this.toNumericAttrs(attrs)

    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: product.routing_template_id! },
      orderBy: { sequence: 'asc' },
      include: {
        workcenter: { select: { code: true, name: true } },
        op_activities: {
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

    if (ops.length === 0) throw new BadRequestException(`No routing ops found for product ${product.id}`)

    const overrides = await this.prisma.product_routing_override.findMany({
      where: { product_id: product.id },
    })
    const overrideMap = new Map(overrides.map(o => [o.activity_template_id, o]))

    const now = new Date()
    const operationResults: OperationCycleTime[] = []

    for (const op of ops) {
      const newCacheKey = this.buildCacheKey(product.id, op.id, attrs)

      if (!force && op.cache_key === newCacheKey && Number(op.time_cycle) > 0) {
        operationResults.push({
          routing_workcenter_id: op.id,
          op_code: op.op_code,
          workcenter_code: op.workcenter.code,
          workcenter_name: op.workcenter.name,
          activities: op.op_activities.map(a => {
            const ovr = overrideMap.get(a.activity_template_id)
            const tpl = a.activity_template
            return {
              activity_template_id: tpl.id,
              description: tpl.description,
              formula_param_code: tpl.formula_param_code,
              formula_expression: tpl.formula_param.formula_expression,
              input_value: 0,
              cycle_time_min: 0,
              manpower: Number(ovr?.override_manpower ?? tpl.manpower),
              per_minute: Number(ovr?.override_per_minute ?? tpl.per_minute),
              std_measure: Number(ovr?.override_std_measure ?? tpl.std_measure),
            }
          }),
          total_cycle_time_min: Number(op.time_cycle),
        })
        continue
      }

      const activityResults: ActivityCycleTime[] = []

      for (const opAct of op.op_activities) {
        const tpl = opAct.activity_template
        const ovr = overrideMap.get(opAct.activity_template_id)
        const perMinute = Number(ovr?.override_per_minute ?? tpl.per_minute)
        const stdMeasure = Number(ovr?.override_std_measure ?? tpl.std_measure)
        const manpower = Number(ovr?.override_manpower ?? tpl.manpower)
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

      await this.prisma.mrp_routing_workcenter.update({
        where: { id: op.id },
        data: { time_cycle: opTotal, last_computed_at: now, cache_key: newCacheKey },
      })
    }

    const totalMin = operationResults.reduce((sum, o) => sum + o.total_cycle_time_min, 0)
    return { product_id: product.id, operations: operationResults, total_cycle_time_min: totalMin, computed_at: now }
  }

  private async computeCustomRouting(
    product: { id: number; attributes: unknown },
    _force: boolean,
  ): Promise<RoutingCycleTimeResult> {
    const attrs = (product.attributes as Record<string, unknown>) ?? {}
    const numericAttrs = this.toNumericAttrs(attrs)

    const customRouting = await this.prisma.custom_routing.findUnique({
      where: { product_id: product.id },
      include: {
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
    })

    if (!customRouting) throw new BadRequestException(`No custom routing for product ${product.id}`)
    if (customRouting.ops.length === 0) {
      throw new BadRequestException(`Custom routing for product ${product.id} has no operations`)
    }

    const now = new Date()
    const operationResults: OperationCycleTime[] = []

    for (const op of customRouting.ops) {
      const activityResults: ActivityCycleTime[] = []

      for (const act of op.activities) {
        const perMinute = Number(act.per_minute)
        const stdMeasure = Number(act.std_measure)
        const manpower = Number(act.manpower)
        const formulaExpr = act.formula_param.formula_expression

        let inputValue: number
        try {
          inputValue = this.formula.evaluate(formulaExpr, numericAttrs)
        } catch {
          inputValue = 0
        }

        const ratio = stdMeasure > 0 ? Math.ceil(inputValue / stdMeasure) : 1
        const cycleTime = ratio * perMinute * manpower

        activityResults.push({
          activity_template_id: 0,
          description: act.description,
          formula_param_code: act.formula_param_code,
          formula_expression: formulaExpr,
          input_value: inputValue,
          cycle_time_min: cycleTime,
          manpower,
          per_minute: perMinute,
          std_measure: stdMeasure,
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
    }

    const totalMin = operationResults.reduce((sum, o) => sum + o.total_cycle_time_min, 0)
    return { product_id: product.id, operations: operationResults, total_cycle_time_min: totalMin, computed_at: now }
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
    let hash = 0
    for (let i = 0; i < payload.length; i++) {
      hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
  }
}
