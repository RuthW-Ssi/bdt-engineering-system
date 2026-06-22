import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { RepairCodeGenerator } from './repair-code.generator'
import { QueryMachineDto } from './dto/query-machine.dto'
import { CreateMaintenanceLogDto } from './dto/create-maintenance-log.dto'
import { OpenRepairTicketDto } from './dto/open-repair-ticket.dto'
import { CloseRepairTicketDto } from './dto/close-repair-ticket.dto'
import { ChangeStatusDto } from './dto/change-status.dto'
import { CreateEquipmentResourceDto } from './dto/create-resource.dto'
import { UpdateEquipmentResourceDto } from './dto/update-resource.dto'
import { CreateOperatorDto } from './dto/create-operator.dto'
import { UpdateOperatorDto } from './dto/update-operator.dto'
import { EquipmentStatus, RepairStatus } from '@prisma/client'

const MOCK_JOBS = [
  { code: 'JO-00001', operation: 'ตัดชิ้นส่วน A', status: 'Done', start: '2026-05-01', end: '2026-05-02' },
  { code: 'JO-00004', operation: 'เชื่อม Frame B', status: 'Done', start: '2026-05-10', end: '2026-05-12' },
  { code: 'JO-00009', operation: 'ตัด Plate C', status: 'Running', start: '2026-06-01', end: null },
  { code: 'JO-00013', operation: 'เชื่อม Bracket D', status: 'Scheduled', start: '2026-06-15', end: null },
  { code: 'JO-00017', operation: 'ตัด Beam E', status: 'Scheduled', start: '2026-06-20', end: null },
]

const STATUS_ORDER: Record<EquipmentStatus, number> = {
  REPAIR: 0, UNAVAILABLE: 1, MAINTENANCE: 2, OPERATIONAL: 3, RETIRED: 4,
}

@Injectable()
export class MachinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: RepairCodeGenerator,
  ) {}

  async findAll(query: QueryMachineDto) {
    const machines = await this.prisma.equipment_resource.findMany({
      where: {
        type: query.type ? query.type : { in: ['machine', 'handling'] },
        active: true,
        ...(query.status ? { current_status: query.status } : {}),
        ...(query.area ? { location: { contains: query.area, mode: 'insensitive' } } : {}),
        ...(query.name ? {
          OR: [
            { name: { contains: query.name, mode: 'insensitive' } },
            { code: { contains: query.name, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true, code: true, name: true, type: true,
        rate: true, rate_unit: true, qty: true,
        current_status: true, last_maintenance_at: true,
        location: true, manufacturer: true, model: true,
        skills: true,
      },
    })

    const now = new Date()
    const sorted = machines.sort((a, b) => b.id - a.id)

    return sorted.map(m => ({
      ...m,
      days_since_pm: m.last_maintenance_at
        ? Math.floor((now.getTime() - m.last_maintenance_at.getTime()) / 86400000)
        : null,
    }))
  }

  async createResource(dto: CreateEquipmentResourceDto) {
    const prefix = dto.type === 'tool' ? 'TOOL' : dto.type === 'consumable' ? 'CON' : 'MC'
    const record = await this.prisma.equipment_resource.create({
      data: { code: dto.code ?? `${prefix}-TEMP`, name: dto.name, type: dto.type,
              location: dto.location, manufacturer: dto.manufacturer, model: dto.model,
              qty: dto.qty, rate: dto.rate, rate_unit: dto.rate_unit },
    })
    const code = dto.code ?? `${prefix}-${String(record.id).padStart(4, '0')}`
    return this.prisma.equipment_resource.update({ where: { id: record.id }, data: { code },
      select: { id: true, code: true, name: true, type: true, rate: true, rate_unit: true,
                qty: true, current_status: true, last_maintenance_at: true,
                location: true, manufacturer: true, model: true, skills: true } })
  }

  async updateResource(id: number, dto: UpdateEquipmentResourceDto) {
    await this.assertExists(id)
    return this.prisma.equipment_resource.update({ where: { id }, data: dto,
      select: { id: true, code: true, name: true, type: true, rate: true, rate_unit: true,
                qty: true, current_status: true, last_maintenance_at: true,
                location: true, manufacturer: true, model: true, skills: true } })
  }

  async removeResource(id: number) {
    await this.assertExists(id)
    await this.prisma.equipment_resource.delete({ where: { id } })
  }

  async findAllSkills() {
    return this.prisma.skill.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
  }

  async findAllFormulas() {
    return this.prisma.consume_formula.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  }

  async createFormula(dto: { name: string; expr: string; result_unit?: string; variables?: string[]; category?: string; description?: string }) {
    return this.prisma.consume_formula.create({ data: { ...dto, variables: dto.variables ?? [] } })
  }

  async updateFormula(id: number, dto: { name?: string; expr?: string; result_unit?: string; variables?: string[]; category?: string; description?: string }) {
    return this.prisma.consume_formula.update({ where: { id }, data: dto })
  }

  async removeFormula(id: number) {
    await this.prisma.consume_formula.delete({ where: { id } })
  }

  async findAllOperators() {
    return this.prisma.operator.findMany({
      where: { active: true },
      select: {
        id: true, code: true, name: true, nationality: true,
        position_raw: true, start_raw: true,
        skills: { select: { skill: { select: { id: true, name: true } }, level: true } },
      },
      orderBy: { id: 'asc' },
    })
  }

  private operatorSelect = {
    id: true, code: true, name: true, nationality: true,
    position_raw: true, start_raw: true,
    skills: { select: { skill: { select: { id: true, name: true } }, level: true } },
  } as const

  async createOperator(dto: CreateOperatorDto) {
    return this.prisma.$transaction(async (tx) => {
      const op = await tx.operator.create({
        data: { code: dto.code, name: dto.name, nationality: dto.nationality ?? null,
                position_raw: dto.position_raw ?? null, start_raw: dto.start_raw ?? null, active: true },
      })
      if (dto.skills?.length) {
        await tx.operator_skill.createMany({
          data: dto.skills.map(s => ({ operator_id: op.id, skill_id: s.skill_id, level: s.level ?? null })),
          skipDuplicates: true,
        })
      }
      return tx.operator.findUniqueOrThrow({ where: { id: op.id }, select: this.operatorSelect })
    })
  }

  async updateOperator(id: number, dto: UpdateOperatorDto) {
    const exists = await this.prisma.operator.findUnique({ where: { id } })
    if (!exists) throw new NotFoundException(`Operator #${id} not found`)
    return this.prisma.$transaction(async (tx) => {
      await tx.operator.update({
        where: { id },
        data: { ...(dto.code !== undefined && { code: dto.code }),
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.nationality !== undefined && { nationality: dto.nationality }),
                ...(dto.position_raw !== undefined && { position_raw: dto.position_raw }),
                ...(dto.start_raw !== undefined && { start_raw: dto.start_raw }) },
      })
      if (dto.skills !== undefined) {
        await tx.operator_skill.deleteMany({ where: { operator_id: id } })
        if (dto.skills.length) {
          await tx.operator_skill.createMany({
            data: dto.skills.map(s => ({ operator_id: id, skill_id: s.skill_id, level: s.level ?? null })),
            skipDuplicates: true,
          })
        }
      }
      return tx.operator.findUniqueOrThrow({ where: { id }, select: this.operatorSelect })
    })
  }

  async findOne(id: number) {
    const machine = await this.prisma.equipment_resource.findUnique({
      where: { id },
      include: {
        _count: {
          select: { repair_tickets: true, maintenance_logs: true },
        },
      },
    })
    if (!machine) throw new NotFoundException(`Machine #${id} not found`)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [repairTicketsThisMonth, pmLogsThisMonth] = await Promise.all([
      this.prisma.repair_ticket.findMany({
        where: { machine_id: id, created_at: { gte: startOfMonth } },
        select: { duration_min: true },
      }),
      this.prisma.maintenance_log.findMany({
        where: { machine_id: id, performed_at: { gte: startOfMonth } },
        select: { duration_min: true },
      }),
    ])

    const round1 = (n: number) => Math.round(n * 10) / 10
    const repairDowntimeHours = round1(
      repairTicketsThisMonth.reduce((s, t) => s + (t.duration_min ?? 0), 0) / 60,
    )
    const pmDowntimeHours = round1(
      pmLogsThisMonth.reduce((s, l) => s + (l.duration_min ?? 0), 0) / 60,
    )

    const days_since_pm = machine.last_maintenance_at
      ? Math.floor((now.getTime() - machine.last_maintenance_at.getTime()) / 86400000)
      : null

    return {
      ...machine,
      days_since_pm,
      quick_stats: {
        last_maintenance_at: machine.last_maintenance_at,
        repairs_this_month: repairTicketsThisMonth.length,
        repair_downtime_hours: repairDowntimeHours,
        pm_downtime_hours: pmDowntimeHours,
        total_downtime_hours: round1(repairDowntimeHours + pmDowntimeHours),
        pm_count_this_month: pmLogsThisMonth.length,
      },
      mock_jobs: MOCK_JOBS,
    }
  }

  async getMaintenanceLogs(machineId: number) {
    await this.assertExists(machineId)
    return this.prisma.maintenance_log.findMany({
      where: { machine_id: machineId },
      orderBy: { performed_at: 'desc' },
    })
  }

  async getRepairTickets(machineId: number) {
    await this.assertExists(machineId)
    const tickets = await this.prisma.repair_ticket.findMany({
      where: { machine_id: machineId },
      orderBy: { created_at: 'desc' },
    })
    const open = tickets.filter(t => t.status === RepairStatus.OPEN || t.status === RepairStatus.IN_PROGRESS)
    const closed = tickets.filter(t => t.status === RepairStatus.CLOSED)
    return [...open, ...closed]
  }

  async getStatusHistory(machineId: number) {
    await this.assertExists(machineId)
    return this.prisma.machine_status_history.findMany({
      where: { machine_id: machineId },
      orderBy: { changed_at: 'desc' },
    })
  }

  async createMaintenanceLog(machineId: number, dto: CreateMaintenanceLogDto) {
    await this.assertExists(machineId)
    const log = await this.prisma.maintenance_log.create({
      data: {
        machine_id: machineId,
        performed_at: new Date(dto.performed_at),
        performed_by: dto.performed_by,
        description: dto.description,
        parts_replaced: dto.parts_replaced,
        duration_min: dto.duration_min,
        notes: dto.notes,
        photo_urls: dto.photo_urls ?? [],
      },
    })
    await this.prisma.equipment_resource.update({
      where: { id: machineId },
      data: { last_maintenance_at: new Date(dto.performed_at) },
    })
    return log
  }

  async openRepairTicket(machineId: number, dto: OpenRepairTicketDto) {
    const machine = await this.assertExists(machineId)
    const ticket = await this.prisma.$transaction(async (tx) => {
      const ticket_code = await this.codeGen.generate(tx)
      return tx.repair_ticket.create({
        data: {
          machine_id: machineId,
          ticket_code,
          severity: dto.severity,
          reported_by: dto.reported_by,
          reported_at: new Date(dto.reported_at),
          problem_description: dto.problem_description,
          photos_before: dto.photos_before ?? [],
        },
      })
    })
    const suggested_status_change = machine.current_status !== EquipmentStatus.REPAIR
      ? { from: machine.current_status, to: EquipmentStatus.REPAIR }
      : null
    return { ticket, suggested_status_change }
  }

  async closeRepairTicket(machineId: number, ticketId: number, dto: CloseRepairTicketDto) {
    const machine = await this.assertExists(machineId)
    const ticket = await this.prisma.repair_ticket.findFirst({
      where: { id: ticketId, machine_id: machineId },
    })
    if (!ticket) throw new NotFoundException(`Repair ticket #${ticketId} not found on machine #${machineId}`)
    if (ticket.status === RepairStatus.CLOSED) throw new ConflictException('Ticket is already closed')

    const closed = await this.prisma.repair_ticket.update({
      where: { id: ticketId },
      data: {
        status: RepairStatus.CLOSED,
        repaired_by: dto.repaired_by,
        closed_at: new Date(dto.closed_at),
        repair_description: dto.repair_description,
        parts_replaced: dto.parts_replaced,
        duration_min: dto.duration_min,
        photos_after: dto.photos_after ?? [],
      },
    })
    const suggested_status_change = machine.current_status === EquipmentStatus.REPAIR
      ? { from: EquipmentStatus.REPAIR, to: EquipmentStatus.OPERATIONAL }
      : null
    return { ticket: closed, suggested_status_change }
  }

  async changeStatus(machineId: number, dto: ChangeStatusDto) {
    const machine = await this.assertExists(machineId)
    const [updated] = await this.prisma.$transaction([
      this.prisma.equipment_resource.update({
        where: { id: machineId },
        data: { current_status: dto.new_status },
      }),
      this.prisma.machine_status_history.create({
        data: {
          machine_id: machineId,
          from_status: machine.current_status,
          to_status: dto.new_status,
          reason: dto.reason,
          changed_by: dto.changed_by,
          ...(dto.related_repair_id != null ? { related_repair_id: dto.related_repair_id } : {}),
          ...(dto.related_maintenance_id != null ? { related_maintenance_id: dto.related_maintenance_id } : {}),
        },
      }),
    ])
    return updated
  }

  private async assertExists(id: number) {
    const m = await this.prisma.equipment_resource.findUnique({ where: { id } })
    if (!m) throw new NotFoundException(`Machine #${id} not found`)
    return m
  }
}
