import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { deriveAssemblyAttrs, PartRow } from '../../libs/products/assembly-derivation'
import { VariantAttributes } from '../../libs/products/profile-parser'

export type DeriveSummary = { high: number; medium: number; low: number; total: number }

export type ReviewQueueItem = {
  assembly_id: number
  assembly_mark: string
  match_status: string
  product_id: number
  product_code: string
  derived_attrs: VariantAttributes
  derivation_flags: string[]
  confidence: 'medium' | 'low'
}

@Injectable()
export class ProductDerivationService {
  private readonly logger = new Logger(ProductDerivationService.name)

  constructor(private readonly prisma: PrismaService) {}

  async deriveForDispatch(dispatchId: number, uid: number): Promise<DeriveSummary> {
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: dispatchId, match_status: { notIn: ['MATCHED_STANDARD', 'MATCHED_CUSTOM'] } },
      include: {
        assembly_parts: {
          include: { part: { select: { profile: true, grade: true, length_mm: true } } },
        },
      },
    })

    // Find a category to use for derived assembly products (Hot Roll Shape or first available)
    const categFallback = await this.prisma.product_category.findFirst({
      where: { prefix_5: { startsWith: 'HR' } },
      select: { id: true },
    }) ?? await this.prisma.product_category.findFirst({ select: { id: true } })

    const categId = categFallback!.id
    const summary: DeriveSummary = { high: 0, medium: 0, low: 0, total: assemblies.length }

    for (const asm of assemblies) {
      const parts: PartRow[] = asm.assembly_parts.map(ap => ({
        profile: ap.part.profile,
        grade: ap.part.grade,
        length_mm: ap.part.length_mm ? Number(ap.part.length_mm) : null,
        qty: 1,
      }))

      const { attrs, flags, confidence, markPrefix } = deriveAssemblyAttrs(asm.assembly_mark, parts)

      const canonicalKey = this.canonicalKey(attrs)
      const productCode = `STD-${markPrefix}-${canonicalKey}`

      const product = await this.prisma.products.upsert({
        where: { product_code: productCode },
        update: {
          variant_attributes: attrs as object,
          derivation_flags: flags,
          confidence,
          write_uid: uid,
          write_date: new Date(),
        },
        create: {
          product_code: productCode,
          name: this.derivedName(attrs, markPrefix),
          categ_id: categId,
          product_type: 'assembly',
          product_kind: 'assembly',
          variant_attributes: attrs as object,
          derivation_flags: flags,
          confidence,
          create_uid: uid,
          write_uid: uid,
        },
      })

      const matchStatus =
        confidence === 'high' ? 'auto_high_conf'
        : confidence === 'medium' ? 'auto_verify'
        : 'needs_review'

      await this.prisma.bom_assembly.update({
        where: { id: asm.id },
        data: { product_id: product.id, match_status: matchStatus, write_uid: uid, write_date: new Date() },
      })

      summary[confidence]++
      this.logger.log(`${asm.assembly_mark} → ${productCode} [${confidence}] flags:${flags.join(',') || 'none'}`)
    }

    this.logger.log(
      `Derived ${summary.total} assemblies for dispatch ${dispatchId}: high=${summary.high} medium=${summary.medium} low=${summary.low}`,
    )
    return summary
  }

  async getReviewQueue(dispatchId: number): Promise<ReviewQueueItem[]> {
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: dispatchId, match_status: { in: ['auto_verify', 'needs_review'] } },
      include: { product: { select: { id: true, product_code: true, variant_attributes: true, derivation_flags: true, confidence: true } } },
      orderBy: { assembly_mark: 'asc' },
    })

    return assemblies
      .filter(a => a.product)
      .map(a => ({
        assembly_id: a.id,
        assembly_mark: a.assembly_mark,
        match_status: a.match_status ?? 'needs_review',
        product_id: a.product!.id,
        product_code: a.product!.product_code,
        derived_attrs: (a.product!.variant_attributes ?? {}) as VariantAttributes,
        derivation_flags: (a.product!.derivation_flags as string[]) ?? [],
        confidence: (a.product!.confidence ?? 'low') as 'medium' | 'low',
      }))
  }

  async confirmAssembly(assemblyId: number, uid: number): Promise<void> {
    const asm = await this.prisma.bom_assembly.findUnique({ where: { id: assemblyId } })
    if (!asm) throw new NotFoundException(`Assembly ${assemblyId} not found`)

    await this.prisma.$transaction([
      this.prisma.bom_assembly.update({
        where: { id: assemblyId },
        data: { match_status: 'auto_high_conf', write_uid: uid, write_date: new Date() },
      }),
      ...(asm.product_id ? [this.prisma.products.update({
        where: { id: asm.product_id },
        data: { confidence: 'high', write_uid: uid, write_date: new Date() },
      })] : []),
    ])
  }

  async overrideVariantAttrs(productId: number, attrs: VariantAttributes, uid: number): Promise<void> {
    const product = await this.prisma.products.findUnique({ where: { id: productId } })
    if (!product) throw new NotFoundException(`Product ${productId} not found`)

    await this.prisma.products.update({
      where: { id: productId },
      data: {
        variant_attributes: attrs as object,
        confidence: 'high',
        derivation_flags: [],
        write_uid: uid,
        write_date: new Date(),
      },
    })
  }

  private canonicalKey(attrs: VariantAttributes): string {
    const { shape, method, grade, height_mm, width_mm, web_thickness_mm, flange_thickness_mm,
      thickness_mm, diameter_mm, outer_diameter_mm, leg_a_mm, leg_b_mm } = attrs
    const sig = JSON.stringify({ shape, method, grade, height_mm, width_mm, web_thickness_mm,
      flange_thickness_mm, thickness_mm, diameter_mm, outer_diameter_mm, leg_a_mm, leg_b_mm })
    return createHash('sha256').update(sig).digest('hex').slice(0, 6).toUpperCase()
  }

  private derivedName(attrs: VariantAttributes, markPrefix: string): string {
    if (attrs.profile) return `${markPrefix} ${attrs.profile} ${attrs.grade ?? ''}`.trim()
    if (attrs.shape === 'H' && attrs.height_mm)
      return `${markPrefix} H${attrs.height_mm}x${attrs.width_mm}x${attrs.web_thickness_mm}x${attrs.flange_thickness_mm} ${attrs.grade ?? ''}`.trim()
    if (attrs.shape === 'L') return `${markPrefix} L${attrs.leg_a_mm}x${attrs.leg_b_mm}x${attrs.thickness_mm} ${attrs.grade ?? ''}`.trim()
    if (attrs.shape === 'RB') return `${markPrefix} RB${attrs.diameter_mm} ${attrs.grade ?? ''}`.trim()
    return `${markPrefix} ${attrs.shape ?? 'UNKNOWN'} ${attrs.grade ?? ''}`.trim()
  }
}
