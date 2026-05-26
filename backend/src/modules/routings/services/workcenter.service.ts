import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { CreateWorkcenterDto } from '../dto/create-workcenter.dto'
import { UpdateWorkcenterDto } from '../dto/update-workcenter.dto'

@Injectable()
export class WorkcenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async create(dto: CreateWorkcenterDto, userId: number) {
    const existing = await this.prisma.mrp_workcenter.findUnique({ where: { code: dto.code } })
    if (existing) throw new ConflictException(`Work center code "${dto.code}" already exists`)

    const maxSeq = await this.prisma.mrp_workcenter.aggregate({ _max: { sequence: true } })
    const sequence = dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10)

    const wc = await this.prisma.mrp_workcenter.create({
      data: {
        code: dto.code,
        name: dto.name,
        sequence,
        oee_target: dto.oee_target ?? 90,
        availability: dto.availability ?? 100,
        performance: dto.performance ?? 100,
        quality: dto.quality ?? 100,
        labor_mix: (dto.labor_mix ?? { operator: 100, skilled: 0, group_head: 0 }) as any,
        labor_cost_per_min: dto.labor_cost_per_min ?? 0,
        electricity_cost_per_min: dto.electricity_cost_per_min ?? 0,
        consumable_cost_per_min: dto.consumable_cost_per_min ?? 0,
        overhead_cost_per_min: dto.overhead_cost_per_min ?? 0,
        create_uid: userId,
        write_uid: userId,
      },
    })

    await this.mail.log({
      model: 'mrp_workcenter', res_id: wc.id, author_id: userId,
      message_type: 'audit', subject: `Work center created: ${wc.code}`,
    })
    return wc
  }

  async findAll() {
    return this.prisma.mrp_workcenter.findMany({
      where: { active: true },
      orderBy: { sequence: 'asc' },
    })
  }

  async findOne(id: number) {
    const wc = await this.prisma.mrp_workcenter.findUnique({ where: { id } })
    if (!wc) throw new NotFoundException(`Work center ${id} not found`)
    return wc
  }

  async update(id: number, dto: UpdateWorkcenterDto, userId: number) {
    await this.findOne(id)

    if (dto.labor_mix) {
      const sum = dto.labor_mix.operator + dto.labor_mix.skilled + dto.labor_mix.group_head
      if (Math.abs(sum - 100) > 0.5) {
        throw new BadRequestException(
          `Labor mix must sum to 100 (got ${sum})`,
        )
      }
    }

    const updated = await this.prisma.mrp_workcenter.update({
      where: { id },
      data: {
        ...dto,
        labor_mix: dto.labor_mix as any,
        write_uid: userId,
        write_date: new Date(),
      },
    })

    await this.mail.log({
      model: 'mrp_workcenter', res_id: id, author_id: userId,
      message_type: 'audit', subject: 'Work center updated',
    })
    return updated
  }

  getCapacity(wc: Awaited<ReturnType<typeof this.findOne>>) {
    const cap = wc.capacity_per_period as any
    const oee = (Number(wc.availability) * Number(wc.performance) * Number(wc.quality)) / 1_000_000
    return {
      oee,
      oee_target: Number(wc.oee_target),
      working_hours_per_week: Number(wc.working_hours_per_week),
      capacity_per_period: cap ?? null,
    }
  }
}
