import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * T-WO.06 · Read-only schedule access (mockup this sprint).
 * The Python APS team will WRITE prod_schedule_version + prod_schedule via a
 * future authenticated endpoint; here we only list + display.
 */
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  /** All versions, newest first. */
  listVersions() {
    return this.prisma.prod_schedule_version.findMany({ orderBy: { id: 'desc' } })
  }

  /** The single active version (Q14a=A · 1 active system-wide) or 404. */
  async activeVersion() {
    const v = await this.prisma.prod_schedule_version.findFirst({
      where: { is_active: true },
      orderBy: { id: 'desc' },
    })
    if (!v) throw new NotFoundException('No active schedule version')
    return v
  }

  /** prod_schedule rows for a WO, grouped by version (active first, then newest). */
  async scheduleForWo(woId: number) {
    const wo = await this.prisma.work_order.findUnique({ where: { id: woId }, select: { id: true } })
    if (!wo) throw new NotFoundException(`WO ${woId} not found`)

    const rows = await this.prisma.prod_schedule.findMany({
      where: { work_order_id: woId },
      include: { prod_schedule_version: true, equipment_resource: true },
      orderBy: { start_datetime: 'asc' },
    })

    const byVersion = new Map<
      number,
      {
        version: {
          id: number
          version_code: string
          is_active: boolean
          scheduler_source: string | null
          description: string | null
        }
        rows: Array<{
          id: number
          start_datetime: Date
          end_datetime: Date
          workcenter_line: { id: number; code: string; name: string } | null
        }>
      }
    >()

    for (const r of rows) {
      const v = r.prod_schedule_version
      if (!byVersion.has(v.id)) {
        byVersion.set(v.id, {
          version: {
            id: v.id,
            version_code: v.version_code,
            is_active: v.is_active,
            scheduler_source: v.scheduler_source,
            description: v.description,
          },
          rows: [],
        })
      }
      byVersion.get(v.id)!.rows.push({
        id: r.id,
        start_datetime: r.start_datetime,
        end_datetime: r.end_datetime,
        workcenter_line: r.equipment_resource
          ? { id: r.equipment_resource.id, code: r.equipment_resource.code, name: r.equipment_resource.name }
          : null,
      })
    }

    // Active version first, then newest id.
    return [...byVersion.values()].sort((a, b) => {
      if (a.version.is_active !== b.version.is_active) return a.version.is_active ? -1 : 1
      return b.version.id - a.version.id
    })
  }
}
