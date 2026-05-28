import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { ProductLibraryCodeGenerator } from '../product-library-code.generator'
import { CreateLibraryDto } from '../dto/create-library.dto'
import { UpdateLibraryDto } from '../dto/update-library.dto'
import { QueryLibraryDto } from '../dto/query-library.dto'

@Injectable()
export class ProductLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
    private readonly codeGen: ProductLibraryCodeGenerator,
  ) {}

  async findAll(query: QueryLibraryDto) {
    const { q, active, page = 1, limit = 20 } = query
    const skip = (page - 1) * limit
    const activeFilter = active === undefined ? true : active

    const where = {
      active: activeFilter,
      ...(q ? {
        OR: [
          { code: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
        ],
      } : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.product_library.count({ where }),
      this.prisma.product_library.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' },
        include: {
          create_user: { select: { id: true, name: true } },
          _count: {
            select: {
              products: { where: { active: true, product_type: 'standard' } },
            },
          },
        },
      }),
    ])

    // Batch cus_count in a single groupBy instead of N per-item queries
    const pageIds = items.map(e => e.id)
    const cusCounts = await this.prisma.products.groupBy({
      by: ['library_id'],
      where: { library_id: { in: pageIds }, active: true, product_type: 'custom' },
      _count: { _all: true },
    })
    const cusCountMap = new Map(cusCounts.map(r => [r.library_id, r._count._all]))

    const itemsWithCounts = items.map(entry => ({
      ...entry,
      std_count: entry._count.products,
      cus_count: cusCountMap.get(entry.id) ?? 0,
    }))

    return { total, page, limit, pages: Math.ceil(total / limit), items: itemsWithCounts }
  }

  async findOne(id: number) {
    const entry = await this.prisma.product_library.findUnique({
      where: { id },
      include: {
        create_user: { select: { id: true, name: true } },
        write_user: { select: { id: true, name: true } },
      },
    })
    if (!entry) throw new NotFoundException(`Library entry ${id} not found`)

    const { stdCount, cusCount } = await this.getProductCounts(id)
    return { ...entry, std_count: stdCount, cus_count: cusCount }
  }

  async create(dto: CreateLibraryDto, userId: number) {
    const trimmedName = dto.name.trim()
    await this.checkNameUnique(trimmedName, null)
    const code = await this.codeGen.generate()

    const entry = await this.prisma.product_library.create({
      data: { code, name: trimmedName, active: true, create_uid: userId, write_uid: userId },
    })

    await this.mail.log({
      model: 'product_library',
      res_id: entry.id,
      message_type: 'audit',
      subject: 'Library Entry Created',
      body: `${entry.code} — ${entry.name}`,
      author_id: userId,
    })

    return entry
  }

  async update(id: number, dto: UpdateLibraryDto, userId: number) {
    // Narrow read — avoid full findOne joins for a simple update
    const current = await this.prisma.product_library.findUnique({
      where: { id },
      select: { name: true, code: true },
    })
    if (!current) throw new NotFoundException(`Library entry ${id} not found`)

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim()
      if (trimmedName.toLowerCase() !== current.name.toLowerCase()) {
        await this.checkNameUnique(trimmedName, id)
      }
    }

    // Check linked product counts BEFORE archiving (count then write)
    let warning: string | undefined
    let stdCount = 0
    let cusCount = 0

    if (dto.active === false) {
      ;({ stdCount, cusCount } = await this.getProductCounts(id))
      const total = stdCount + cusCount
      if (total > 0) warning = `${total} product(s) still reference this library entry`
    }

    const updated = await this.prisma.product_library.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        write_uid: userId,
        write_date: new Date(),
      },
    })

    await this.mail.log({
      model: 'product_library',
      res_id: id,
      message_type: 'audit',
      subject: 'Library Entry Updated',
      body: `${updated.code} updated`,
      author_id: userId,
    })

    return { ...updated, ...(warning ? { warning, std_count: stdCount, cus_count: cusCount } : {}) }
  }

  async remove(id: number, userId: number) {
    // Narrow read — only need code + name for audit log
    const current = await this.prisma.product_library.findUnique({
      where: { id },
      select: { code: true, name: true },
    })
    if (!current) throw new NotFoundException(`Library entry ${id} not found`)

    const { stdCount, cusCount } = await this.getProductCounts(id)
    const total = stdCount + cusCount
    if (total > 0) {
      throw new ConflictException({
        message: `Cannot delete: ${total} product(s) still reference this library entry`,
        stdCount,
        cusCount,
      })
    }

    const archived = await this.prisma.product_library.update({
      where: { id },
      data: { active: false, write_uid: userId, write_date: new Date() },
    })

    await this.mail.log({
      model: 'product_library',
      res_id: id,
      message_type: 'audit',
      subject: 'Library Entry Archived',
      body: `${current.code} — ${current.name} archived`,
      author_id: userId,
    })

    return archived
  }

  private async getProductCounts(libraryId: number) {
    const [stdCount, cusCount] = await Promise.all([
      this.prisma.products.count({ where: { library_id: libraryId, active: true, product_type: 'standard' } }),
      this.prisma.products.count({ where: { library_id: libraryId, active: true, product_type: 'custom' } }),
    ])
    return { stdCount, cusCount }
  }

  private async checkNameUnique(name: string, excludeId: number | null) {
    const existing = await this.prisma.product_library.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId !== null ? { id: { not: excludeId } } : {}),
      },
    })
    if (existing) throw new ConflictException(`Name already exists as ${existing.code}`)
  }
}
