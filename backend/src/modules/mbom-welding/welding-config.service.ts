import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { WeldingConfigRowDto } from './dto/save-welding-config.dto'
import type { WeldingConfigResponseDto } from './dto/welding-mbom-response.dto'
import type {
  PaintSpecPreset,
  ProductSpecPreset,
  ResolvedPaintSpec,
  ResolvedWeldingSpec,
  WeldingSpecPreset,
} from '../../common/types/spec-preset.types'

@Injectable()
export class WeldingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async save(dispatchId: number, configs: WeldingConfigRowDto[], uid: number): Promise<void> {
    const dispatch = await this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId }, select: { id: true } })
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)

    await this.prisma.$transaction(
      configs.map(c =>
        this.prisma.dispatch_assembly_welding_config.upsert({
          where: { dispatch_id_assembly_id: { dispatch_id: dispatchId, assembly_id: c.assembly_id } },
          update: {
            material_id: c.material_id ?? null,
            fillet_mm: c.fillet_mm ?? null,
            sides: c.sides ?? null,
            weld_layers: c.weld_layers ?? null,
            write_uid: uid,
            write_date: new Date(),
          },
          create: {
            dispatch_id: dispatchId,
            assembly_id: c.assembly_id,
            material_id: c.material_id ?? null,
            fillet_mm: c.fillet_mm ?? null,
            sides: c.sides ?? null,
            weld_layers: c.weld_layers ?? null,
            create_uid: uid,
            write_uid: uid,
          },
        }),
      ),
    )
  }

  async getConfig(dispatchId: number): Promise<WeldingConfigResponseDto> {
    const [assemblies, standardProducts] = await Promise.all([
      this.prisma.bom_assembly.findMany({
        where: { dispatch_id: dispatchId },
        orderBy: { assembly_mark: 'asc' },
        select: {
          id: true,
          assembly_mark: true,
          welding_configs: {
            where: { dispatch_id: dispatchId },
            select: {
              material_id: true,
              fillet_mm: true,
              sides: true,
              weld_layers: true,
              material: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.products.findMany({
        where: { active: true, product_type: 'standard' },
        select: { id: true, product_code: true, name: true, default_paint_spec: true, default_welding_spec: true },
        orderBy: { product_code: 'asc' },
      }),
    ])

    const productsWithSpec = standardProducts.filter(
      p => p.default_welding_spec !== null || p.default_paint_spec !== null,
    )

    // Resolve all material_codes in one query
    const allCodes = new Set<string>()
    for (const p of productsWithSpec) {
      const ws = p.default_welding_spec as unknown as WeldingSpecPreset | null
      if (ws?.material_code) allCodes.add(ws.material_code)
      const ps = p.default_paint_spec as unknown as PaintSpecPreset | null
      ps?.layers.forEach(l => allCodes.add(l.material_code))
    }

    const materials = await this.prisma.materials.findMany({
      where: { default_code: { in: [...allCodes] } },
      select: { id: true, default_code: true },
    })
    const codeToId = new Map(materials.map(m => [m.default_code, m.id]))

    const available_presets: ProductSpecPreset[] = productsWithSpec.map(p => {
      const rawWeld = p.default_welding_spec as unknown as WeldingSpecPreset | null
      const rawPaint = p.default_paint_spec as unknown as PaintSpecPreset | null

      const welding_spec: ResolvedWeldingSpec | null = rawWeld
        ? { ...rawWeld, material_id: codeToId.get(rawWeld.material_code) ?? null }
        : null

      const paint_spec: ResolvedPaintSpec | null = rawPaint
        ? { layers: rawPaint.layers.map(l => ({ ...l, material_id: codeToId.get(l.material_code) ?? null })) }
        : null

      return { product_id: p.id, product_code: p.product_code, product_name: p.name, paint_spec, welding_spec }
    })

    return {
      dispatch_id: dispatchId,
      assemblies: assemblies.map(a => {
        const cfg = a.welding_configs[0] ?? null
        return {
          assembly_id: a.id,
          assembly_mark: a.assembly_mark,
          material_id: cfg?.material_id ?? null,
          material_name: cfg?.material?.name ?? null,
          fillet_mm: cfg?.fillet_mm ? Number(cfg.fillet_mm) : null,
          sides: cfg?.sides ?? null,
          weld_layers: cfg?.weld_layers ?? null,
        }
      }),
      available_presets,
    }
  }
}
