import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, WoStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { MailMessageService } from '../mail/mail-message.service'
import { JwtPayload } from '../auth/auth.service'
import { SchedulerApiClient, ScheduleRunResult } from './scheduler-api.client'
import { RunScheduleDto } from './dto/run-schedule.dto'
import { BoardVersion, BoardWorkOrder, ScheduleBoard } from './schedule-board.types'

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/** WOs the board always shows, placed by the chosen version or not. */
export const BOARD_OPEN_WO_STATUSES: WoStatus[] = ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD']

/**
 * Board version pick: the requested version if it has rows, else the active one if it
 * has rows, else the newest (highest id) with rows, else null.
 */
export function pickBoardVersionId(
  versions: Pick<BoardVersion, 'id' | 'is_active' | 'row_count'>[],
  requested?: number,
): number | null {
  const withRows = versions.filter((v) => v.row_count > 0).sort((a, b) => b.id - a.id)
  if (requested != null && withRows.some((v) => v.id === requested)) return requested
  return (withRows.find((v) => v.is_active) ?? withRows[0])?.id ?? null
}

const num = (d: Prisma.Decimal | number | null | undefined): number | null => (d == null ? null : Number(d))
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

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

  /**
   * Read-only Gantt payload for one version (pick order: pickBoardVersionId). Fixed
   * query count, no N+1 — 5 lookups in parallel, then ops → WOs (+live marks, parts) → routing ops ∥ MOs.
   */
  async board(requestedVersionId?: number): Promise<ScheduleBoard> {
    const [versionRows, wcRows, lines, teams, offDays] = await Promise.all([
      this.prisma.prod_schedule_version.findMany({
        orderBy: { id: 'desc' },
        select: {
          id: true,
          version_code: true,
          description: true,
          scheduler_source: true,
          is_active: true,
          created_at: true,
          created_by: true,
          _count: { select: { schedules: true } },
        },
      }),
      this.prisma.mrp_workcenter.findMany({
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          availability: true,
          performance: true,
          quality: true,
          oee_target: true,
        },
      }),
      this.prisma.mrp_workcenter_line.findMany({
        orderBy: [{ workcenter_id: 'asc' }, { line_no: 'asc' }],
        select: { id: true, workcenter_id: true, line_no: true, name: true, active: true },
      }),
      this.prisma.team.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, team_type: true, active: true },
      }),
      this.prisma.calendar_exception.findMany({ where: { is_working: false }, select: { date: true } }),
    ])

    const versions: BoardVersion[] = versionRows.map(({ _count, created_at, ...v }) => ({
      ...v,
      created_at: created_at.toISOString(),
      row_count: _count.schedules,
    }))
    const version_id = pickBoardVersionId(versions, requestedVersionId)

    const opRows =
      version_id == null
        ? []
        : await this.prisma.prod_schedule.findMany({
            where: { prod_schedule_version_id: version_id },
            orderBy: [{ start_datetime: 'asc' }, { id: 'asc' }],
            select: { work_order_id: true, workcenter_line_id: true, start_datetime: true, end_datetime: true },
          })

    const woRows = await this.prisma.work_order.findMany({
      where: {
        OR: [
          { id: { in: [...new Set(opRows.map((o) => o.work_order_id))] } },
          { status: { in: BOARD_OPEN_WO_STATUSES } },
        ],
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        wo_code: true,
        mo_id: true,
        sequence: true,
        status: true,
        expected_duration_min: true,
        setup_time_min: true,
        plan_start: true,
        plan_finish: true,
        source_routing_op_id: true,
        subcontractor_id: true,
        team_headcount: true,
        // Removing a mark is a soft delete that leaves its work_order_part rows behind,
        // so parts are kept only when their assembly is still a live mark of the WO.
        marks: { where: { removed_at: null }, select: { bom_assembly_id: true } },
        parts: {
          select: {
            weight_kg: true,
            bom_assembly_part: { select: { assembly_id: true, assembly: { select: { assembly_mark: true } } } },
          },
        },
      },
    })

    // source_routing_op_id is a soft ref (no relation) — resolve the op type in one query.
    const routingOpIds = [...new Set(woRows.flatMap((w) => (w.source_routing_op_id == null ? [] : [w.source_routing_op_id])))]
    const moIds = [...new Set(woRows.map((w) => w.mo_id))]
    const [routingOps, moRows] = await Promise.all([
      this.prisma.mrp_routing_workcenter.findMany({
        where: { id: { in: routingOpIds } },
        select: { id: true, op_type: { select: { key: true, label: true } } },
      }),
      this.prisma.manufacturing_order.findMany({
        where: { id: { in: moIds } },
        orderBy: { id: 'asc' },
        select: { id: true, mo_code: true, primary_mark_prefix_code: true, plan_start: true, plan_finish: true },
      }),
    ])
    const opLabelById = new Map(
      // `||`, not `??` — label is non-null but the op-type DTOs accept ''.
      routingOps.map((r) => [r.id, r.op_type ? r.op_type.label || r.op_type.key : null] as const),
    )

    const work_orders: BoardWorkOrder[] = woRows.map((w) => {
      const liveAsm = new Set(w.marks.map((m) => m.bom_assembly_id))
      const parts = w.parts.filter((p) => liveAsm.has(p.bom_assembly_part.assembly_id))
      return {
        id: w.id,
        wo_code: w.wo_code,
        mo_id: w.mo_id,
        sequence: w.sequence,
        status: w.status,
        expected_duration_min: w.expected_duration_min,
        setup_time_min: w.setup_time_min,
        plan_start: iso(w.plan_start),
        plan_finish: iso(w.plan_finish),
        op_label: w.source_routing_op_id == null ? null : (opLabelById.get(w.source_routing_op_id) ?? null),
        team_id: w.subcontractor_id,
        team_headcount: w.team_headcount,
        marks: [...new Set(parts.map((p) => p.bom_assembly_part.assembly.assembly_mark))].sort(),
        // Decimal sum, so 0.1 + 0.2 kg doesn't come back as 0.30000000000000004.
        weight_kg: parts.length
          ? parts.reduce((sum, p) => sum.plus(p.weight_kg), new Prisma.Decimal(0)).toNumber()
          : null,
      }
    })

    return {
      versions,
      version_id,
      generated_at: new Date().toISOString(),
      ops: opRows.map((o) => ({
        work_order_id: o.work_order_id,
        workcenter_line_id: o.workcenter_line_id,
        start: o.start_datetime.toISOString(),
        end: o.end_datetime.toISOString(),
      })),
      work_orders,
      mos: moRows.map((m) => ({ ...m, plan_start: iso(m.plan_start), plan_finish: iso(m.plan_finish) })),
      work_centers: wcRows.map((wc) => ({
        ...wc,
        availability: num(wc.availability),
        performance: num(wc.performance),
        quality: num(wc.quality),
        oee_target: num(wc.oee_target),
      })),
      lines,
      teams,
      // @db.Date comes back as UTC midnight, so the ISO date part is the calendar day.
      holidays: [...new Set(offDays.map((d) => d.date.toISOString().slice(0, 10)))].sort(),
    }
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
