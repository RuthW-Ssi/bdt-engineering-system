import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PaintConfigRowDto } from './dto/save-paint-config.dto'
import { PaintConfigAssemblyDto, PaintConfigResponseDto } from './dto/mbom-response.dto'
import type {
  PaintSpecPreset,
  ProductSpecPreset,
  ResolvedPaintSpec,
  ResolvedWeldingSpec,
  WeldingSpecPreset,
} from '../../common/types/spec-preset.types'

@Injectable()
export class PaintConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async save(dispatchId: number, configs: PaintConfigRowDto[], uid: number): Promise<void> {
    const dispatch = await this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId } })
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)

    await this.prisma.$transaction(
      configs.map(c =>
        this.prisma.dispatch_assembly_paint_config.upsert({
          where: { assembly_id_paint_type: { assembly_id: c.assembly_id, paint_type: c.paint_type } },
          update: { material_id: c.material_id ?? null, layers: c.layers, write_uid: uid, write_date: new Date() },
          create: {
            dispatch_id: dispatchId,
            assembly_id: c.assembly_id,
            paint_type: c.paint_type,
            material_id: c.material_id ?? null,
            layers: c.layers,
            create_uid: uid,
            write_uid: uid,
          },
        }),
      ),
    )
  }

  async getConfig(dispatchId: number): Promise<PaintConfigResponseDto> {
    const [dispatch, assemblies, standardProducts] = await Promise.all([
      this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId }, select: { id: true } }),
      this.prisma.bom_assembly.findMany({
        where: { dispatch_id: dispatchId },
        orderBy: { assembly_mark: 'asc' },
        select: {
          id: true,
          assembly_mark: true,
          name: true,
          surface_area_m2: true,
          qty: true,
          paint_configs: {
            select: {
              paint_type: true,
              material_id: true,
              layers: true,
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

    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)

    const productsWithSpec = standardProducts.filter(
      p => p.default_paint_spec !== null || p.default_welding_spec !== null,
    )

    // Collect all material_codes from presets to resolve in one query
    const allCodes = new Set<string>()
    for (const p of productsWithSpec) {
      const ps = p.default_paint_spec as unknown as PaintSpecPreset | null
      ps?.layers.forEach(l => allCodes.add(l.material_code))
      const ws = p.default_welding_spec as unknown as WeldingSpecPreset | null
      if (ws?.material_code) allCodes.add(ws.material_code)
    }

    const materials = await this.prisma.materials.findMany({
      where: { default_code: { in: [...allCodes] } },
      select: { id: true, default_code: true },
    })
    const codeToId = new Map(materials.map(m => [m.default_code, m.id]))

    const available_presets: ProductSpecPreset[] = productsWithSpec.map(p => {
      const rawPaint = p.default_paint_spec as unknown as PaintSpecPreset | null
      const rawWeld = p.default_welding_spec as unknown as WeldingSpecPreset | null

      const paint_spec: ResolvedPaintSpec | null = rawPaint
        ? { layers: rawPaint.layers.map(l => ({ ...l, material_id: codeToId.get(l.material_code) ?? null })) }
        : null

      const welding_spec: ResolvedWeldingSpec | null = rawWeld
        ? { ...rawWeld, material_id: codeToId.get(rawWeld.material_code) ?? null }
        : null

      return { product_id: p.id, product_code: p.product_code, product_name: p.name, paint_spec, welding_spec }
    })

    const result: PaintConfigAssemblyDto[] = assemblies.map(a => ({
      assembly_id: a.id,
      assembly_mark: a.assembly_mark,
      name: a.name ?? null,
      surface_area_m2: a.surface_area_m2 ? Number(a.surface_area_m2) : null,
      assembly_qty: Number(a.qty ?? 1),
      configs: a.paint_configs.map(c => ({
        paint_type: c.paint_type,
        material_id: c.material_id ?? null,
        layers: c.layers,
        material_name: c.material?.name ?? null,
      })),
    }))

    return { dispatch_id: dispatchId, assemblies: result, available_presets }
  }
}
