import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class TemplateBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async bindProduct(productId: number): Promise<number | null> {
    const product = await this.prisma.products.findUniqueOrThrow({
      where: { id: productId },
      select: { id: true, product_type: true, categ_id: true, attributes: true, has_custom_routing: true, mark_prefix: true },
    })

    if (product.has_custom_routing) return null

    const rules = await this.prisma.routing_template_binding_rule.findMany({
      where: { active: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    })

    const attrs = (product.attributes as Record<string, unknown>) ?? {}

    for (const rule of rules) {
      if (rule.match_product_type && rule.match_product_type !== product.product_type) continue
      if (rule.match_categ_id && rule.match_categ_id !== product.categ_id) continue
      if (rule.match_mark_prefix && !product.mark_prefix?.startsWith(rule.match_mark_prefix)) continue
      if (rule.match_attr_path && rule.match_attr_value) {
        const attrVal = String(attrs[rule.match_attr_path] ?? '')
        if (attrVal !== rule.match_attr_value) continue
      }

      await this.prisma.products.update({
        where: { id: productId },
        data: { routing_template_id: rule.routing_template_id },
      })
      return rule.routing_template_id
    }

    return null
  }

  async rebindAll(): Promise<{ bound: number; unmatched: number }> {
    const products = await this.prisma.products.findMany({
      where: { has_custom_routing: false },
      select: { id: true },
    })

    let bound = 0
    let unmatched = 0

    for (const p of products) {
      const tplId = await this.bindProduct(p.id)
      if (tplId !== null) bound++
      else unmatched++
    }

    return { bound, unmatched }
  }
}
