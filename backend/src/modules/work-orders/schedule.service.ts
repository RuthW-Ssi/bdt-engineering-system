import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * T-WO.06 · Read-only schedule access.
 * The production scheduler (backend-schedule/, Python) WRITES prod_schedule_version +
 * prod_schedule; here we only list + display. A run with `activate` makes its version
 * the single active one served by activeVersion().
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
      include: { prod_schedule_version: true, workcenter_line: { include: { workcenter: true } } },
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
        // The line the scheduler placed this WO on, e.g. code "WC-PAINT-L2", name "Paint bay 2".
        workcenter_line: r.workcenter_line
          ? {
              id: r.workcenter_line.id,
              code: `${r.workcenter_line.workcenter.code}-L${r.workcenter_line.line_no}`,
              name: r.workcenter_line.name ?? `${r.workcenter_line.workcenter.name} · L${r.workcenter_line.line_no}`,
            }
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
