import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface PromotionCandidate {
  custom_routing_id: number
  product_code: string
  op_codes: string[]
}

export interface PromoteResult {
  template_id: number
  template_code: string
  rebound_product_ids: number[]
}

@Injectable()
export class RoutingPromotionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Find custom routings that share the same op_code sequence (candidates for promotion) */
  async findCandidates(): Promise<{ op_key: string; count: number; candidates: PromotionCandidate[] }[]> {
    const customRoutings = await this.prisma.custom_routing.findMany({
      where: { state: 'active' },
      include: {
        product: { select: { product_code: true } },
        ops: { orderBy: { sequence: 'asc' }, select: { op_code: true } },
      },
    })

    // Group by sorted op_code sequence key
    const groups = new Map<string, PromotionCandidate[]>()
    for (const cr of customRoutings) {
      const key = cr.ops.map(o => o.op_code).join('|')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({
        custom_routing_id: cr.id,
        product_code: cr.product.product_code,
        op_codes: cr.ops.map(o => o.op_code),
      })
    }

    return Array.from(groups.entries())
      .filter(([, candidates]) => candidates.length >= 3)
      .map(([op_key, candidates]) => ({ op_key, count: candidates.length, candidates }))
  }

  /** Promote a custom routing to a new shared template, then rebind the source product */
  async promote(
    customRoutingId: number,
    newTemplateName: string,
    uid: number,
  ): Promise<PromoteResult> {
    const customRouting = await this.prisma.custom_routing.findUnique({
      where: { id: customRoutingId },
      include: {
        product: true,
        ops: {
          orderBy: { sequence: 'asc' },
          include: {
            activities: { orderBy: { sequence: 'asc' } },
          },
        },
      },
    })
    if (!customRouting) throw new BadRequestException(`Custom routing ${customRoutingId} not found`)

    const templateCode = newTemplateName.toUpperCase().replace(/\s+/g, '_').slice(0, 20)

    return this.prisma.$transaction(async tx => {
      // 1. Create new routing_template
      const template = await tx.routing_template.create({
        data: {
          code: templateCode,
          name: newTemplateName,
          state: 'active',
          active: true,
          create_uid: uid,
          write_uid: uid,
        },
      })

      // 2. Clone ops + activities from custom_routing into template
      for (const op of customRouting.ops) {
        const newOp = await tx.mrp_routing_workcenter.create({
          data: {
            template_id: template.id,
            sequence: op.sequence,
            op_code: op.op_code,
            name: op.name,
            workcenter_id: op.workcenter_id,
            create_uid: uid,
            write_uid: uid,
          },
        })

        for (const act of op.activities) {
          await tx.routing_op_activity.create({
            data: {
              routing_workcenter_id: newOp.id,
              activity_template_id: await this.resolveActivityTemplateId(tx, act),
              sequence: act.sequence,
            },
          })
        }
      }

      // 3. Obsolete custom routing + rebind product to new template
      await tx.custom_routing.update({
        where: { id: customRoutingId },
        data: { state: 'obsolete' },
      })
      await tx.products.update({
        where: { id: customRouting.product_id },
        data: {
          has_custom_routing: false,
          routing_template_id: template.id,
        },
      })

      return {
        template_id: template.id,
        template_code: template.code,
        rebound_product_ids: [customRouting.product_id],
      }
    })
  }

  /** Resolve or find matching activity_template_id for a custom_routing_activity */
  private async resolveActivityTemplateId(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    act: { formula_param_code: string; per_minute: unknown; std_measure: unknown; workcenter_id: number },
  ): Promise<number> {
    // Try to find existing activity template with same formula_param + workcenter
    const existing = await tx.routing_activity_template.findFirst({
      where: { formula_param_code: act.formula_param_code, workcenter_id: act.workcenter_id },
    })
    if (existing) return existing.id
    throw new BadRequestException(
      `No activity_template found for formula_param_code=${act.formula_param_code} workcenter_id=${act.workcenter_id}. ` +
        `Create an activity template first before promoting.`,
    )
  }
}
