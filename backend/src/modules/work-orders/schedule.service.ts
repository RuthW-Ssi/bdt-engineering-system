import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailMessageService } from '../mail/mail-message.service'
import { JwtPayload } from '../auth/auth.service'
import { SchedulerApiClient, ScheduleRunResult } from './scheduler-api.client'
import { RunScheduleDto } from './dto/run-schedule.dto'

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * pg_try_advisory_xact_lock key shared with the Python scheduler
 * (backend-schedule/app/solver/engine.py LOCK_KEY, ASCII "SCHEDULE"). Never change one side alone.
 */
export const SCHEDULER_LOCK_KEY = 0x5343484544554c45n

/** Current time in Asia/Bangkok (fixed UTC+7, no DST) as ISO-8601 with "+07:00". */
export function bangkokNowIso(now: Date = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+07:00')
}

/**
 * T-WO.06 · Schedule access.
 * The production scheduler (backend-schedule/, Python — Cloud Run `prod-scheduler`,
 * ADR-0015) WRITES prod_schedule_version + prod_schedule; run() only triggers it and
 * the rows travel through the DB. A run with `activate` (or activate()) makes its
 * version the single active one served by activeVersion().
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerApiClient,
    private readonly mail: MailMessageService,
  ) {}

  /** Trigger a persisted scheduler run, then audit it on the version it wrote. */
  async run(dto: RunScheduleDto, user: JwtPayload): Promise<ScheduleRunResult> {
    const dispatch_rule = dto.dispatch_rule ?? 'EDD'
    const activate = dto.activate ?? false
    const result = await this.scheduler.run({
      direction: dto.direction,
      dispatch_rule,
      activate,
      persist: true,
      now: bangkokNowIso(),
      requested_by: user.login,
    })
    await this.mail.log({
      model: 'prod_schedule_version',
      // persist=true always returns version_id; 0 only if the service broke contract.
      res_id: result.version_id ?? 0,
      message_type: 'audit',
      subject: 'Scheduler run',
      body:
        `direction=${dto.direction} rule=${dispatch_rule} activate=${activate} ` +
        `work_orders=${result.kpi?.work_orders} late_vs_due=${result.kpi?.late_vs_due}`,
      author_id: user.sub,
    })
    return result
  }

  /** Make `id` the single active version (Q14a=A). */
  async activate(id: number, user: JwtPayload) {
    const version = await this.prisma.$transaction(async (tx) => {
      // First statement: serialize against scheduler runs and other activations, so two
      // concurrent writers can't each leave their own row is_active=true.
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        select pg_try_advisory_xact_lock(${SCHEDULER_LOCK_KEY}) as locked`
      if (!locked) throw new ConflictException('A scheduler run is in progress')
      const existing = await tx.prod_schedule_version.findUnique({ where: { id } })
      if (!existing) throw new NotFoundException(`Schedule version ${id} not found`)
      await tx.prod_schedule_version.updateMany({
        where: { is_active: true, id: { not: id } },
        data: { is_active: false },
      })
      return tx.prod_schedule_version.update({ where: { id }, data: { is_active: true } })
    })
    await this.mail.log({
      model: 'prod_schedule_version',
      res_id: id,
      message_type: 'audit',
      subject: 'Schedule version activated',
      body: `version_code=${version.version_code}`,
      author_id: user.sub,
    })
    return version
  }

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
