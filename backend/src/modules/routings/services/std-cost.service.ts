import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { CycleTimeService } from './cycle-time.service'

export interface WcCostBreakdown {
  workcenter_code: string
  workcenter_name: string
  cycle_time_min: number
  labor_cost: number
  electricity_cost: number
  consumable_cost: number
  overhead_cost: number
  total_cost: number
}

export interface StdCostResult {
  product_id: number
  cost_per_op: WcCostBreakdown[]
  total_cycle_time_min: number
  total_production_cost: number
  computed_at: Date
}

@Injectable()
export class StdCostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cycleTime: CycleTimeService,
  ) {}

  async compute(productId: number): Promise<StdCostResult> {
    const cycleResult = await this.cycleTime.compute(productId)

    const wcIds = [
      ...new Set(
        cycleResult.operations.map(o => o.routing_workcenter_id),
      ),
    ]

    // Load workcenter cost rates
    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { id: { in: wcIds } },
      include: { workcenter: true },
    })

    const wcMap = Object.fromEntries(ops.map(o => [o.id, o.workcenter]))

    const costPerOp: WcCostBreakdown[] = cycleResult.operations.map(op => {
      const wc = wcMap[op.routing_workcenter_id]
      const t = op.total_cycle_time_min

      const labor        = t * Number(wc?.labor_cost_per_min ?? 0)
      const electricity  = t * Number(wc?.electricity_cost_per_min ?? 0)
      const consumable   = t * Number(wc?.consumable_cost_per_min ?? 0)
      const overhead     = t * Number(wc?.overhead_cost_per_min ?? 0)

      return {
        workcenter_code: op.workcenter_code,
        workcenter_name: op.workcenter_name,
        cycle_time_min: t,
        labor_cost: labor,
        electricity_cost: electricity,
        consumable_cost: consumable,
        overhead_cost: overhead,
        total_cost: labor + electricity + consumable + overhead,
      }
    })

    const totalCost = costPerOp.reduce((s, c) => s + c.total_cost, 0)

    // Write back to products.cost_production
    await this.prisma.products.update({
      where: { id: productId },
      data: { cost_production: totalCost },
    })

    return {
      product_id: productId,
      cost_per_op: costPerOp,
      total_cycle_time_min: cycleResult.total_cycle_time_min,
      total_production_cost: totalCost,
      computed_at: new Date(),
    }
  }

  async getBreakdown(productId: number): Promise<StdCostResult> {
    const product = await this.prisma.products.findUnique({
      where: { id: productId },
      select: { id: true, cost_production: true },
    })
    if (!product) throw new BadRequestException(`Product ${productId} not found`)
    // Recompute fresh each time (cache layer is Sprint 4 RT7)
    return this.compute(productId)
  }
}
