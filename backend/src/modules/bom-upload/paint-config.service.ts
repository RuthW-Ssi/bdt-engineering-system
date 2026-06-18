import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export interface SavePaintConfigDto {
  configs: {
    assembly_id: number
    paint_type: string
    material_id: number | null
    layers?: number
  }[]
}

@Injectable()
export class PaintConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(dispatchId: number) {
    const dispatch = await this.prisma.bom_dispatch.findUnique({
      where: { id: dispatchId },
      include: {
        assemblies: {
          orderBy: { assembly_mark: 'asc' },
          include: {
            paint_configs: {
              include: { material: { select: { id: true, name: true } } },
            },
          },
        },
      },
    })
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)

    return {
      dispatch_id: dispatchId,
      assemblies: dispatch.assemblies.map(asm => ({
        assembly_id: asm.id,
        assembly_mark: asm.assembly_mark,
        name: asm.name,
        surface_area_m2: asm.surface_area_m2 ? Number(asm.surface_area_m2) : null,
        assembly_qty: asm.qty ? Number(asm.qty) : 1,
        configs: asm.paint_configs.map(pc => ({
          paint_type: pc.paint_type,
          material_id: pc.material_id,
          layers: pc.layers,
          material_name: pc.material?.name ?? null,
        })),
      })),
      available_presets: [],
    }
  }

  async saveConfig(dispatchId: number, dto: SavePaintConfigDto) {
    const dispatch = await this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId } })
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)

    await this.prisma.$transaction(
      dto.configs.map(c =>
        this.prisma.mbom_assembly_paint.upsert({
          where: { assembly_id_paint_type: { assembly_id: c.assembly_id, paint_type: c.paint_type } },
          create: {
            dispatch_id: dispatchId,
            assembly_id: c.assembly_id,
            paint_type: c.paint_type,
            material_id: c.material_id ?? null,
            layers: c.layers ?? 1,
            write_date: new Date(),
          },
          update: {
            material_id: c.material_id ?? null,
            layers: c.layers ?? 1,
            write_date: new Date(),
          },
        }),
      ),
    )

    return this.getConfig(dispatchId)
  }
}
