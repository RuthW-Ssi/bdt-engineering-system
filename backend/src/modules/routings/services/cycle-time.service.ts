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
  operation_template_id: number | null
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

  async compute(productId: number, _force = false): Promise<RoutingCycleTimeResult> {
    const product = await this.prisma.products.findUnique({
      where: { id: productId },
      select: { id: true, routing_template_id: true },
    })
    if (!product) throw new BadRequestException(`Product ${productId} not found`)
    if (!product.routing_template_id) {
      return { product_id: productId, operations: [], total_cycle_time_min: 0, computed_at: new Date() }
    }

    const routingOps = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: product.routing_template_id },
      orderBy: { sequence: 'asc' },
      include: {
        workcenter: { select: { code: true, name: true } },
        operation_template: {
          include: {
            activities: {
              orderBy: { sequence: 'asc' },
              include: {
                source_activity: { select: { id: true, name: true, duration_min: true } },
                skills: { select: { skill: true, qty: true, level: true } },
              },
            },
          },
        },
      },
    })

    const operations: OperationCycleTime[] = []
    let totalMin = 0

    for (const op of routingOps) {
      const activities: ActivityCycleTime[] = []
      let opTotal = 0

      if (op.operation_template) {
        for (const act of op.operation_template.activities) {
          const durationMin = act.source_activity
            ? Number(act.source_activity.duration_min ?? 0)
            : Number(act.per_minute ?? 0)
          const manpower = act.skills.reduce((sum, s) => sum + s.qty, 0) || 1

          activities.push({
            activity_template_id: act.id,
            description: act.name,
            formula_param_code: '',
            formula_expression: '',
            input_value: 0,
            cycle_time_min: durationMin,
            manpower,
            per_minute: Number(act.per_minute ?? 0),
            std_measure: 0,
          })
          opTotal += durationMin
        }
      } else {
        // Fall back to activities_snapshot when no operation_template is linked
        const snap = op.activities_snapshot as any[]
        if (Array.isArray(snap)) {
          for (const act of snap) {
            const durationMin = Number(act.duration_min ?? act.per_minute ?? 0)
            activities.push({
              activity_template_id: act.source_activity_id ?? 0,
              description: act.name ?? '',
              formula_param_code: '',
              formula_expression: '',
              input_value: 0,
              cycle_time_min: durationMin,
              manpower: (act.labors ?? []).reduce((s: number, l: any) => s + (l.qty ?? 1), 0) || 1,
              per_minute: Number(act.per_minute ?? 0),
              std_measure: 0,
            })
            opTotal += durationMin
          }
        }
      }

      operations.push({
        routing_workcenter_id: op.id,
        op_code: op.op_code,
        workcenter_code: op.workcenter.code,
        workcenter_name: op.workcenter.name,
        operation_template_id: op.operation_template_id,
        activities,
        total_cycle_time_min: opTotal,
      })
      totalMin += opTotal
    }

    return { product_id: productId, operations, total_cycle_time_min: totalMin, computed_at: new Date() }
  }
}
