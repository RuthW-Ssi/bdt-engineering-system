import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface CreateOpTypeDto {
  key: string
  label: string
  color?: string
  default_op_code?: string
  method_options?: { value: string; label: string }[]
  sequence?: number
  default_wc_id?: number
}

export interface UpdateOpTypeDto {
  label?: string
  color?: string
  default_op_code?: string
  method_options?: { value: string; label: string }[]
  sequence?: number
  default_wc_id?: number | null
  is_active?: boolean
}

@Injectable()
export class OpTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.mrp_op_type.findMany({
      where: includeInactive ? undefined : { is_active: true },
      include: { default_wc: { select: { id: true, code: true, name: true } } },
      orderBy: { sequence: 'asc' },
    })
  }

  async findOne(id: number) {
    const ot = await this.prisma.mrp_op_type.findUnique({
      where: { id },
      include: { default_wc: { select: { id: true, code: true, name: true } } },
    })
    if (!ot) throw new NotFoundException(`Op type ${id} not found`)
    return ot
  }

  async create(dto: CreateOpTypeDto) {
    const existing = await this.prisma.mrp_op_type.findUnique({ where: { key: dto.key } })
    if (existing) throw new ConflictException(`Op type key "${dto.key}" already exists`)

    const maxSeq = await this.prisma.mrp_op_type.aggregate({ _max: { sequence: true } })
    const sequence = dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10)

    return this.prisma.mrp_op_type.create({
      data: {
        key: dto.key,
        label: dto.label,
        color: dto.color ?? '#555555',
        default_op_code: dto.default_op_code ?? null,
        method_options: (dto.method_options ?? null) as any,
        sequence,
        default_wc_id: dto.default_wc_id ?? null,
      },
      include: { default_wc: { select: { id: true, code: true, name: true } } },
    })
  }

  async update(id: number, dto: UpdateOpTypeDto) {
    await this.findOne(id)
    return this.prisma.mrp_op_type.update({
      where: { id },
      data: {
        ...dto,
        method_options: dto.method_options !== undefined ? (dto.method_options as any) : undefined,
        write_date: new Date(),
      },
      include: { default_wc: { select: { id: true, code: true, name: true } } },
    })
  }

  async remove(id: number) {
    await this.findOne(id)
    return this.prisma.mrp_op_type.update({
      where: { id },
      data: { is_active: false, write_date: new Date() },
    })
  }
}
