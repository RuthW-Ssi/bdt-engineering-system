import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { UpdateWorkcenterDto } from '../dto/update-workcenter.dto'

@Injectable()
export class WorkcenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

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
