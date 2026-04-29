import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'
import { ActivityCycleTime, OperationCycleTime } from './cycle-time.service'

export interface SimulateResult {
  template_id: number
  template_code: string
  attributes: Record<string, number>
  fixture_id?: number
  operations: OperationCycleTime[]
  total_cycle_time_min: number
  simulated_at: Date
}

export interface RequiredAttr {
  key: string
  used_by: string[] // formula_param_codes that need this key
}

@Injectable()
export class TemplateSimulatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
  ) {}

  /** RT44 — list attribute keys required by all formula params on the template */
  async getRequiredAttrs(templateId: number): Promise<RequiredAttr[]> {
    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: templateId },
      include: {
        op_activities: {
          include: {
            activity_template: {
              include: {
                formula_param: { select: { code: true, inputs_required: true } },
                formula_param2: { select: { code: true, inputs_required: true } },
              },
            },
          },
        },
      },
    })

    const keyMap = new Map<string, Set<string>>() // attr_key → Set<formula_param_code>
    for (const op of ops) {
      for (const opAct of op.op_activities) {
        const tpl = opAct.activity_template
        for (const key of tpl.formula_param.inputs_required) {
          if (!keyMap.has(key)) keyMap.set(key, new Set())
          keyMap.get(key)!.add(tpl.formula_param_code)
        }
        if (tpl.formula_param2) {
          for (const key of tpl.formula_param2.inputs_required) {
            if (!keyMap.has(key)) keyMap.set(key, new Set())
            keyMap.get(key)!.add(tpl.formula_param_code2!)
          }
        }
      }
    }

    return Array.from(keyMap.entries()).map(([key, codes]) => ({
      key,
      used_by: Array.from(codes),
    }))
  }

  /** RT45 — run simulation against arbitrary attributes without touching the DB */
  async simulate(
    templateId: number,
    attributes: Record<string, number>,
    fixtureId?: number,
  ): Promise<SimulateResult> {
    const template = await this.prisma.routing_template.findUnique({
      where: { id: templateId },
    })
    if (!template) throw new BadRequestException(`Template ${templateId} not found`)

    // If fixture_id given, merge fixture.attribute_values over the provided attributes
    let resolvedAttrs = { ...attributes }
    if (fixtureId) {
      const fixture = await this.prisma.routing_template_test_fixture.findFirst({
        where: { id: fixtureId, template_id: templateId },
      })
      if (!fixture) throw new BadRequestException(`Fixture ${fixtureId} not found for template ${templateId}`)
      resolvedAttrs = { ...(fixture.attribute_values as Record<string, number>), ...attributes }
    }

    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: templateId },
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

    if (ops.length === 0) throw new BadRequestException(`Template ${templateId} has no operations`)

    const operationResults: OperationCycleTime[] = []

    for (const op of ops) {
      const activityResults: ActivityCycleTime[] = []

      for (const opAct of op.op_activities) {
        const tpl = opAct.activity_template
        const perMinute = Number(tpl.per_minute)
        const stdMeasure = Number(tpl.std_measure)
        const manpower = Number(tpl.manpower)
        const formulaExpr = tpl.formula_param.formula_expression

        let inputValue: number
        try {
          inputValue = this.formula.evaluate(formulaExpr, resolvedAttrs)
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
    }

    const totalMin = operationResults.reduce((sum, o) => sum + o.total_cycle_time_min, 0)
    return {
      template_id: templateId,
      template_code: template.code,
      attributes: resolvedAttrs,
      fixture_id: fixtureId,
      operations: operationResults,
      total_cycle_time_min: totalMin,
      simulated_at: new Date(),
    }
  }

  /** RT47 — list saved fixtures for a template */
  async listFixtures(templateId: number) {
    return this.prisma.routing_template_test_fixture.findMany({
      where: { template_id: templateId },
      orderBy: { create_date: 'asc' },
      include: { source_product: { select: { product_code: true, name: true } } },
    })
  }

  /** RT47 — save a new fixture */
  async createFixture(
    templateId: number,
    dto: {
      name: string
      description?: string
      source_mode: string
      source_product_id?: number
      attribute_values: Record<string, number>
      expected_total_min?: number
      expected_total_cost?: number
    },
    uid: number,
  ) {
    const template = await this.prisma.routing_template.findUnique({ where: { id: templateId } })
    if (!template) throw new BadRequestException(`Template ${templateId} not found`)
    return this.prisma.routing_template_test_fixture.create({
      data: { ...dto, template_id: templateId, create_uid: uid },
    })
  }
}
