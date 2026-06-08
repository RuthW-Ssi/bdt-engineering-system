import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { IsString, IsOptional, IsInt, IsArray, IsBoolean, MaxLength } from 'class-validator'
import { PrismaService } from '../../../prisma/prisma.service'

export class CreateOpTypeDto {
  @IsString()
  @MaxLength(50)
  key: string

  @IsString()
  @MaxLength(100)
  label: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  default_op_code?: string

  @IsOptional()
  @IsArray()
  method_options?: { value: string; label: string }[]

  @IsOptional()
  @IsInt()
  sequence?: number

  @IsOptional()
  @IsInt()
  default_wc_id?: number
}

export class UpdateOpTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  default_op_code?: string

  @IsOptional()
  @IsArray()
  method_options?: { value: string; label: string }[]

  @IsOptional()
  @IsInt()
  sequence?: number

  @IsOptional()
  @IsInt()
  default_wc_id?: number | null

  @IsOptional()
  @IsBoolean()
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

  async create(dto: CreateOpTypeDto, userId: number) {
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

  async update(id: number, dto: UpdateOpTypeDto, userId: number) {
    await this.findOne(id)
    return this.prisma.mrp_op_type.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.default_op_code !== undefined ? { default_op_code: dto.default_op_code } : {}),
        ...(dto.method_options !== undefined ? { method_options: dto.method_options as any } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.default_wc_id !== undefined ? { default_wc_id: dto.default_wc_id } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
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
