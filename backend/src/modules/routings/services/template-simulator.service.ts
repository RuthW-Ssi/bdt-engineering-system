import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'
import { OperationCycleTime } from './cycle-time.service'

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
  used_by: string[]
}

@Injectable()
export class TemplateSimulatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
  ) {}

  // Sprint 11b: rebuild on Activity Library — Sprint 4 routing chain dropped
  async getRequiredAttrs(_templateId: number): Promise<RequiredAttr[]> {
    return []
  }

  // Sprint 11b: rebuild on Activity Library — Sprint 4 routing chain dropped
  async simulate(
    templateId: number,
    _attributes: Record<string, number>,
    _fixtureId?: number,
  ): Promise<SimulateResult> {
    const tpl = await this.prisma.routing_template.findUnique({
      where: { id: templateId },
      select: { code: true },
    })
    if (!tpl) throw new BadRequestException(`Template ${templateId} not found`)
    return {
      template_id: templateId,
      template_code: tpl.code,
      attributes: _attributes,
      fixture_id: _fixtureId,
      operations: [],
      total_cycle_time_min: 0,
      simulated_at: new Date(),
    }
  }

  async listFixtures(templateId: number) {
    return this.prisma.routing_template_test_fixture.findMany({
      where: { template_id: templateId },
      orderBy: { create_date: 'desc' },
      include: { source_product: { select: { id: true, product_code: true, name: true } } },
    })
  }

  async createFixture(
    templateId: number,
    body: {
      name: string
      description?: string
      source_mode: string
      source_product_id?: number
      attribute_values: Record<string, number>
      expected_total_min?: number
      expected_total_cost?: number
    },
    userId: number,
  ) {
    return this.prisma.routing_template_test_fixture.create({
      data: {
        template_id: templateId,
        name: body.name,
        description: body.description,
        source_mode: body.source_mode,
        source_product_id: body.source_product_id,
        attribute_values: body.attribute_values,
        expected_total_min: body.expected_total_min,
        expected_total_cost: body.expected_total_cost,
        create_uid: userId,
      },
    })
  }
}
