import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PaintConfigRowDto } from './dto/save-paint-config.dto'
import { PaintConfigAssemblyDto, PaintConfigResponseDto } from './dto/mbom-response.dto'

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
    const dispatch = await this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId } })
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)

    const assemblies = await this.prisma.bom_assembly.findMany({
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

    return { dispatch_id: dispatchId, assemblies: result }
  }
}
