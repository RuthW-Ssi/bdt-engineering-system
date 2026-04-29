import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'

@Injectable()
export class ActivityTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
  ) {}

  async findAll(opCode?: string, workcenterId?: number, page = 1, limit = 50) {
    const where: any = { active: true }
    if (opCode) where.op_code = opCode
    if (workcenterId) where.workcenter_id = workcenterId

    const [items, total] = await Promise.all([
      this.prisma.routing_activity_template.findMany({
        where,
        orderBy: [{ op_code: 'asc' }, { sequence: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          formula_param: { select: { code: true, formula_expression: true, inputs_required: true } },
          workcenter: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.routing_activity_template.count({ where }),
    ])

    return {
      items,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    }
  }

  async findOne(id: number) {
    const t = await this.prisma.routing_activity_template.findUnique({
      where: { id },
      include: {
        formula_param: true,
        workcenter: true,
      },
    })
    if (!t) throw new NotFoundException(`Activity template ${id} not found`)
    return t
  }

  async preview(id: number, productAttrs: Record<string, number>) {
    const tpl = await this.findOne(id)
    const expr = tpl.formula_param.formula_expression

    let inputValue: number
    try {
      inputValue = this.formula.evaluate(expr, productAttrs)
    } catch {
      inputValue = 0
    }

    const stdMeasure = Number(tpl.std_measure)
    const ratio = stdMeasure > 0 ? Math.ceil(inputValue / stdMeasure) : 1
    const cycleTime = ratio * Number(tpl.per_minute) * Number(tpl.manpower)

    return {
      activity_template_id: id,
      description: tpl.description,
      formula_expression: expr,
      input_attrs: productAttrs,
      input_value: inputValue,
      std_measure: stdMeasure,
      per_minute: Number(tpl.per_minute),
      manpower: Number(tpl.manpower),
      cycle_time_min: cycleTime,
    }
  }

  async findAllParams() {
    return this.prisma.routing_formula_param.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
    })
  }
}
