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

  // Sprint 11b: rebuild on Activity Library — Sprint 4 routing chain dropped
  async compute(productId: number): Promise<StdCostResult> {
    const product = await this.prisma.products.findUnique({
      where: { id: productId },
      select: { id: true },
    })
    if (!product) throw new BadRequestException(`Product ${productId} not found`)
    return { product_id: productId, cost_per_op: [], total_cycle_time_min: 0, total_production_cost: 0, computed_at: new Date() }
  }
}
