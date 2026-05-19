import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { WeldingConfigRowDto } from './dto/save-welding-config.dto'
import type { WeldingConfigResponseDto } from './dto/welding-mbom-response.dto'

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
          update: { material_id: c.material_id ?? null, write_uid: uid, write_date: new Date() },
          create: { dispatch_id: dispatchId, assembly_id: c.assembly_id, material_id: c.material_id ?? null, create_uid: uid, write_uid: uid },
        }),
      ),
    )
  }

  async getConfig(dispatchId: number): Promise<WeldingConfigResponseDto> {
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: dispatchId },
      orderBy: { assembly_mark: 'asc' },
      select: {
        id: true,
        assembly_mark: true,
        welding_configs: {
          where: { dispatch_id: dispatchId },
          select: {
            material_id: true,
            material: { select: { name: true } },
          },
        },
      },
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
        }
      }),
    }
  }
}
