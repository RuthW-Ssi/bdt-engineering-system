import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { CreateBomDto } from '../dto/create-bom.dto'
import { UpdateBomDto } from '../dto/update-bom.dto'
import { AddBomLineDto } from '../dto/add-bom-line.dto'
import { QueryBomDto } from '../dto/query-bom.dto'
import { assertBomTransition } from '../boms.state-machine'
import { BomExplosionService } from './bom-explosion.service'
import type { Prisma } from '@prisma/client'

@Injectable()
export class BomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
    private readonly explosion: BomExplosionService,
  ) {}

  private validateLineXor(dto: { material_id?: number; sub_product_id?: number }) {
    const hasMaterial = dto.material_id !== undefined && dto.material_id !== null
    const hasSubProduct = dto.sub_product_id !== undefined && dto.sub_product_id !== null
    if (hasMaterial === hasSubProduct) {
      throw new BadRequestException(
        'Exactly one of material_id or sub_product_id must be set on a BOM line',
      )
    }
  }

  private handlePrismaError(err: unknown): never {
    const prismaErr = err as { code?: string; message?: string }
    if (prismaErr?.code === 'P2010' || (prismaErr?.message ?? '').includes('immutable')) {
      throw new ConflictException('BOM is active — requires ECO to modify lines')
    }
    throw err
  }

  async create(dto: CreateBomDto, uid: number) {
    const product = await this.prisma.products.findUnique({
      where: { product_code: dto.product_code },
    })
    if (!product) throw new NotFoundException(`Product ${dto.product_code} not found`)

    const bom = await this.prisma.product_bom.create({
      data: {
        product_id: product.id,
        version: dto.version ?? '1.0.0',
        bom_view: dto.bom_view ?? 'eBOM',
        owner_role: dto.owner_role ?? 'engineering',
        product_qty: dto.product_qty ?? 1,
        product_uom_id: dto.product_uom_id,
        bom_type: dto.bom_type ?? 'normal',
        effective_from: dto.effective_from ? new Date(dto.effective_from) : undefined,
        effective_to: dto.effective_to ? new Date(dto.effective_to) : undefined,
        notes: dto.notes,
        state: 'draft',
        create_uid: uid,
        write_uid: uid,
      },
      include: { lines: true, product: { select: { id: true, product_code: true, name: true } } },
    })

    await this.mail.log({
      model: 'product',
      res_id: bom.id,
      message_type: 'audit',
      subject: 'BOM Created',
      body: `BOM v${bom.version} (${bom.bom_view}) created for product ${dto.product_code}`,
      author_id: uid,
    })

    return bom
  }

  async findAllForProduct(productCode: string, query: QueryBomDto) {
    const product = await this.prisma.products.findUnique({
      where: { product_code: productCode },
    })
    if (!product) throw new NotFoundException(`Product ${productCode} not found`)

    const where: Prisma.product_bomWhereInput = {
      product_id: product.id,
      ...(query.bom_view ? { bom_view: query.bom_view } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.version ? { version: query.version } : {}),
    }

    return this.prisma.product_bom.findMany({
      where,
      orderBy: { create_date: 'desc' },
      include: {
        product: { select: { id: true, product_code: true, name: true } },
        _count: { select: { lines: true } },
      },
    })
  }

  async findOne(bomId: number) {
    const bom = await this.prisma.product_bom.findUnique({
      where: { id: bomId },
      include: {
        product: { select: { id: true, product_code: true, name: true } },
        lines: {
          include: {
            material: { select: { id: true, default_code: true, name: true } },
            sub_product: { select: { id: true, product_code: true, name: true } },
            product_uom: { select: { id: true, name: true } },
          },
          orderBy: { sequence: 'asc' },
        },
        create_user: { select: { id: true, name: true } },
        write_user: { select: { id: true, name: true } },
      },
    })
    if (!bom) throw new NotFoundException(`BOM ${bomId} not found`)
    return bom
  }

  async update(bomId: number, dto: UpdateBomDto, uid: number) {
    const bom = await this.findOne(bomId)
    if (bom.state !== 'draft') {
      throw new BadRequestException(`BOM can only be updated in draft state (current: ${bom.state})`)
    }

    return this.prisma.product_bom.update({
      where: { id: bomId },
      data: {
        ...(dto.version !== undefined ? { version: dto.version } : {}),
        ...(dto.bom_view !== undefined ? { bom_view: dto.bom_view } : {}),
        ...(dto.owner_role !== undefined ? { owner_role: dto.owner_role } : {}),
        ...(dto.product_qty !== undefined ? { product_qty: dto.product_qty } : {}),
        ...(dto.product_uom_id !== undefined ? { product_uom_id: dto.product_uom_id } : {}),
        ...(dto.bom_type !== undefined ? { bom_type: dto.bom_type } : {}),
        ...(dto.effective_from !== undefined
          ? { effective_from: dto.effective_from ? new Date(dto.effective_from) : null }
          : {}),
        ...(dto.effective_to !== undefined
          ? { effective_to: dto.effective_to ? new Date(dto.effective_to) : null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        write_uid: uid,
        write_date: new Date(),
      },
      include: { lines: true, product: { select: { id: true, product_code: true, name: true } } },
    })
  }

  async remove(bomId: number, uid: number) {
    const bom = await this.findOne(bomId)
    if (bom.state !== 'draft') {
      throw new BadRequestException(`Only draft BOMs can be deleted (current: ${bom.state})`)
    }
    return this.prisma.product_bom.update({
      where: { id: bomId },
      data: { state: 'obsolete', write_uid: uid, write_date: new Date() },
    })
  }

  async addLine(bomId: number, dto: AddBomLineDto, uid: number) {
    this.validateLineXor(dto)
    const bom = await this.findOne(bomId)
    if (bom.state !== 'draft') {
      throw new BadRequestException(`Cannot add lines to a BOM in state '${bom.state}'`)
    }

    try {
      return await this.prisma.product_bom_line.create({
        data: {
          bom_id: bomId,
          sequence: dto.sequence ?? 10,
          material_id: dto.material_id,
          sub_product_id: dto.sub_product_id,
          product_qty: dto.product_qty,
          product_uom_id: dto.product_uom_id,
          scrap_pct: dto.scrap_pct ?? 0,
          cutting_length_mm: dto.cutting_length_mm,
          weight_per_unit_kg: dto.weight_per_unit_kg,
          note: dto.note,
          part_mark: dto.part_mark,
          profile: dto.profile,
          grade: dto.grade,
          length_mm: dto.length_mm,
          area_m2: dto.area_m2,
        },
        include: {
          material: { select: { id: true, default_code: true, name: true } },
          sub_product: { select: { id: true, product_code: true, name: true } },
        },
      })
    } catch (err) {
      this.handlePrismaError(err)
    }
  }

  async updateLine(bomId: number, lineId: number, dto: Partial<AddBomLineDto>, uid: number) {
    if (dto.material_id !== undefined || dto.sub_product_id !== undefined) {
      this.validateLineXor(dto as AddBomLineDto)
    }

    const line = await this.prisma.product_bom_line.findFirst({
      where: { id: lineId, bom_id: bomId },
    })
    if (!line) throw new NotFoundException(`BOM line ${lineId} not found in BOM ${bomId}`)

    try {
      return await this.prisma.product_bom_line.update({
        where: { id: lineId },
        data: {
          ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
          ...(dto.material_id !== undefined ? { material_id: dto.material_id } : {}),
          ...(dto.sub_product_id !== undefined ? { sub_product_id: dto.sub_product_id } : {}),
          ...(dto.product_qty !== undefined ? { product_qty: dto.product_qty } : {}),
          ...(dto.product_uom_id !== undefined ? { product_uom_id: dto.product_uom_id } : {}),
          ...(dto.scrap_pct !== undefined ? { scrap_pct: dto.scrap_pct } : {}),
          ...(dto.cutting_length_mm !== undefined ? { cutting_length_mm: dto.cutting_length_mm } : {}),
          ...(dto.weight_per_unit_kg !== undefined ? { weight_per_unit_kg: dto.weight_per_unit_kg } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(dto.part_mark !== undefined ? { part_mark: dto.part_mark } : {}),
          ...(dto.profile !== undefined ? { profile: dto.profile } : {}),
          ...(dto.grade !== undefined ? { grade: dto.grade } : {}),
          ...(dto.length_mm !== undefined ? { length_mm: dto.length_mm } : {}),
          ...(dto.area_m2 !== undefined ? { area_m2: dto.area_m2 } : {}),
        },
        include: {
          material: { select: { id: true, default_code: true, name: true } },
          sub_product: { select: { id: true, product_code: true, name: true } },
        },
      })
    } catch (err) {
      this.handlePrismaError(err)
    }
  }

  async removeLine(bomId: number, lineId: number, uid: number) {
    const line = await this.prisma.product_bom_line.findFirst({
      where: { id: lineId, bom_id: bomId },
    })
    if (!line) throw new NotFoundException(`BOM line ${lineId} not found in BOM ${bomId}`)

    try {
      return await this.prisma.product_bom_line.delete({ where: { id: lineId } })
    } catch (err) {
      this.handlePrismaError(err)
    }
  }

  async activate(bomId: number, uid: number) {
    const bom = await this.findOne(bomId)
    assertBomTransition(bom.state as any, 'action_activate')

    const previousActive = await this.prisma.product_bom.findFirst({
      where: {
        product_id: bom.product_id,
        bom_view: bom.bom_view,
        state: 'active',
        id: { not: bomId },
      },
    })

    if (previousActive) {
      await this.prisma.product_bom.update({
        where: { id: previousActive.id },
        data: { state: 'obsolete', write_uid: uid, write_date: new Date() },
      })
      await this.mail.log({
        model: 'product',
        res_id: previousActive.id,
        message_type: 'notification',
        subject: `State: active → obsolete`,
        body: `Superseded by BOM ${bomId} activation`,
        tracking: [{ field: 'state', old_value: 'active', new_value: 'obsolete' }],
        author_id: uid,
      })
    }

    const updated = await this.prisma.product_bom.update({
      where: { id: bomId },
      data: { state: 'active', write_uid: uid, write_date: new Date() },
    })

    await this.mail.log({
      model: 'product',
      res_id: bomId,
      message_type: 'notification',
      subject: `State: draft → active`,
      body: `BOM activated`,
      tracking: [{ field: 'state', old_value: 'draft', new_value: 'active' }],
      author_id: uid,
    })

    return updated
  }

  async obsolete(bomId: number, uid: number) {
    const bom = await this.findOne(bomId)
    assertBomTransition(bom.state as any, 'action_obsolete')

    const updated = await this.prisma.product_bom.update({
      where: { id: bomId },
      data: { state: 'obsolete', write_uid: uid, write_date: new Date() },
    })

    await this.mail.log({
      model: 'product',
      res_id: bomId,
      message_type: 'notification',
      subject: `State: ${bom.state} → obsolete`,
      body: `BOM marked obsolete`,
      tracking: [{ field: 'state', old_value: bom.state, new_value: 'obsolete' }],
      author_id: uid,
    })

    return updated
  }

  async explode(bomId: number, parentQty = 1) {
    await this.findOne(bomId)
    return this.explosion.explode(bomId, parentQty)
  }

  async aggregate(bomId: number, parentQty = 1) {
    const exploded = await this.explode(bomId, parentQty)
    return this.explosion.aggregate(exploded)
  }
}
