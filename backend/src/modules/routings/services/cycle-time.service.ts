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

  // Sprint 11b: rebuild on Activity Library — Sprint 4 routing chain dropped
  async compute(productId: number, _force = false): Promise<RoutingCycleTimeResult> {
    const product = await this.prisma.products.findUnique({
      where: { id: productId },
      select: { id: true },
    })
    if (!product) throw new BadRequestException(`Product ${productId} not found`)
    return { product_id: productId, operations: [], total_cycle_time_min: 0, computed_at: new Date() }
  }
}
