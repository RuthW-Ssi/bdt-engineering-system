import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailMessageService } from '../mail/mail-message.service'
import { CreateCustomerDto } from './dto/create-customer.dto'
import { UpdateCustomerDto } from './dto/update-customer.dto'
import { QueryCustomerDto } from './dto/query-customer.dto'

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async create(dto: CreateCustomerDto, uid: number) {
    const customer = await this.prisma.res_partner.create({
      data: { ...dto, create_uid: uid, write_uid: uid },
    })
    await this.mail.log({ model: 'material', res_id: customer.id, message_type: 'audit', subject: 'Customer created', author_id: uid })
    return customer
  }

  async findAll(query: QueryCustomerDto) {
    const page = Number(query.page ?? 1)
    const limit = Number(query.limit ?? 50)
    const skip = (page - 1) * limit
    const active = query.active !== 'false'

    const where = {
      active,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { ref: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.res_partner.count({ where }),
      this.prisma.res_partner.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: { _count: { select: { projects: true } } },
      }),
    ])

    return { total, page, limit, items }
  }

  async findOne(id: number) {
    const customer = await this.prisma.res_partner.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    })
    if (!customer) throw new NotFoundException(`Customer #${id} not found`)
    return customer
  }

  async update(id: number, dto: UpdateCustomerDto, uid: number) {
    await this.findOne(id)
    const updated = await this.prisma.res_partner.update({
      where: { id },
      data: { ...dto, write_uid: uid },
    })
    await this.mail.log({ model: 'material', res_id: id, message_type: 'audit', subject: 'Customer updated', author_id: uid })
    return updated
  }

  async remove(id: number, uid: number) {
    await this.findOne(id)
    await this.prisma.res_partner.update({
      where: { id },
      data: { active: false, write_uid: uid },
    })
    await this.mail.log({ model: 'material', res_id: id, message_type: 'audit', subject: 'Customer archived', author_id: uid })
    return { ok: true }
  }
}
