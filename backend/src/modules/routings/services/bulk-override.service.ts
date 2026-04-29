import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface BulkOverrideCriteria {
  routing_template_id?: number
  product_type?: string
  mark_prefix?: string
  categ_id?: number
  attribute_filter?: { path: string; value: string } // e.g. { path: 'material_group', value: 'STEEL_PLATE' }
}

export interface BulkOverrideFields {
  activity_template_id: number
  override_per_minute?: number
  override_std_measure?: number
  override_manpower?: number
  reason: string
}

export interface BulkOverrideOptions {
  eco_id?: number
  preview_only?: boolean
}

export interface BulkOverrideResult {
  matched_count: number
  applied_count: number
  skipped_count: number // has_custom_routing=true — skip, warn
  eco_required: boolean
  affected_products: { id: number; product_code: string; name: string }[]
}

@Injectable()
export class BulkOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkUpsert(
    criteria: BulkOverrideCriteria,
    override: BulkOverrideFields,
    options: BulkOverrideOptions,
    uid: number,
  ): Promise<BulkOverrideResult> {
    const products = await this.matchProducts(criteria)
    const eligible = products.filter(p => !p.has_custom_routing)
    const skipped = products.filter(p => p.has_custom_routing)

    if (options.preview_only) {
      return {
        matched_count: products.length,
        applied_count: 0,
        skipped_count: skipped.length,
        eco_required: false, // ⏳ Sprint 5 ECO gate
        affected_products: eligible.map(p => ({ id: p.id, product_code: p.product_code, name: p.name })),
      }
    }

    await this.prisma.$transaction(async tx => {
      for (const product of eligible) {
        await tx.product_routing_override.upsert({
          where: {
            product_id_activity_template_id: {
              product_id: product.id,
              activity_template_id: override.activity_template_id,
            },
          },
          create: {
            product_id: product.id,
            activity_template_id: override.activity_template_id,
            override_per_minute: override.override_per_minute,
            override_std_measure: override.override_std_measure,
            override_manpower: override.override_manpower,
            reason: override.reason,
            eco_id: options.eco_id,
            create_uid: uid,
            write_uid: uid,
          },
          update: {
            override_per_minute: override.override_per_minute,
            override_std_measure: override.override_std_measure,
            override_manpower: override.override_manpower,
            reason: override.reason,
            eco_id: options.eco_id,
            write_uid: uid,
            write_date: new Date(),
          },
        })
      }
    })

    return {
      matched_count: products.length,
      applied_count: eligible.length,
      skipped_count: skipped.length,
      eco_required: false, // ⏳ Sprint 5
      affected_products: eligible.map(p => ({ id: p.id, product_code: p.product_code, name: p.name })),
    }
  }

  private async matchProducts(criteria: BulkOverrideCriteria) {
    const where: Record<string, unknown> = {}

    if (criteria.routing_template_id) where.routing_template_id = criteria.routing_template_id
    if (criteria.product_type) where.product_type = criteria.product_type
    if (criteria.categ_id) where.categ_id = criteria.categ_id
    if (criteria.mark_prefix) {
      where.product_code = { startsWith: criteria.mark_prefix }
    }

    const products = await this.prisma.products.findMany({
      where,
      select: {
        id: true,
        product_code: true,
        name: true,
        has_custom_routing: true,
        attributes: true,
      },
    })

    if (!criteria.attribute_filter) return products

    // Filter by JSONB attribute value (client-side — Sprint 5 may add GIN index + DB-side filter)
    const { path, value } = criteria.attribute_filter
    return products.filter(p => {
      const attrs = (p.attributes as Record<string, unknown>) ?? {}
      return String(attrs[path]) === value
    })
  }
}
