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
        type: { in: ['machine', 'handling'] },
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
        current_status: true, last_maintenance_at: true,
        location: true, manufacturer: true, model: true,
      },
    })

    const now = new Date()
    const sorted = machines.sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.current_status] - STATUS_ORDER[b.current_status]
      if (statusDiff !== 0) return statusDiff
      const daysA = a.last_maintenance_at ? (now.getTime() - a.last_maintenance_at.getTime()) / 86400000 : 9999
      const daysB = b.last_maintenance_at ? (now.getTime() - b.last_maintenance_at.getTime()) / 86400000 : 9999
      return daysB - daysA
    })

    return sorted.map(m => ({
      ...m,
      days_since_pm: m.last_maintenance_at
        ? Math.floor((now.getTime() - m.last_maintenance_at.getTime()) / 86400000)
        : null,
    }))
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
    const repairsThisMonth = await this.prisma.repair_ticket.count({
      where: { machine_id: id, created_at: { gte: startOfMonth } },
    })

    const days_since_pm = machine.last_maintenance_at
      ? Math.floor((now.getTime() - machine.last_maintenance_at.getTime()) / 86400000)
      : null

    return {
      ...machine,
      days_since_pm,
      quick_stats: {
        last_maintenance_at: machine.last_maintenance_at,
        repairs_this_month: repairsThisMonth,
        downtime_hours: null,
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
