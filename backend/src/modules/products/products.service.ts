import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailMessageService } from '../mail/mail-message.service'
import { MasterDataService } from '../master-data/master-data.service'
import { ProductCodeGenerator } from './product-code.generator'
import { CreateStandardProductDto } from './dto/create-standard-product.dto'
import { CreateCustomProductDto } from './dto/create-custom-product.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { QueryProductDto } from './dto/query-product.dto'
import { assertProductTransition, PRODUCT_ACTIONS } from './products.state-machine'
import { validateStandardProduct } from './validators/standard-product.validator'
import { validateCustomProduct } from './validators/custom-product.validator'
import type { Prisma } from '@prisma/client'

type CreateProductDto = CreateStandardProductDto | CreateCustomProductDto

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
    private readonly masterData: MasterDataService,
    private readonly codeGen: ProductCodeGenerator,
  ) {}

  private async guardCategory(id: number) {
    const cat = await this.masterData.findCategoryById(id)
    if (!cat || !cat.active) throw new UnprocessableEntityException(`categ_id ${id} not found or inactive`)
    return cat
  }

  async create(dto: CreateProductDto, userId: number) {
    await this.guardCategory(dto.categ_id)

    if (dto.product_type === 'standard') {
      return this.createStandard(dto, userId)
    } else {
      return this.createCustom(dto, userId)
    }
  }

  private async createStandard(dto: CreateStandardProductDto, userId: number) {
    validateStandardProduct({
      sale_ok: dto.sale_ok,
      purchase_ok: dto.purchase_ok,
      item_code: dto.item_code,
      cost_raw_material: dto.cost_raw_material,
      cost_transport: dto.cost_transport,
      cost_production: dto.cost_production,
      cost_warehouse: dto.cost_warehouse,
    })

    const productCode = await this.codeGen.generate('STD')

    const product = await this.prisma.products.create({
      data: {
        product_code: productCode,
        engineering_code: dto.engineering_code,
        item_code: dto.item_code,
        name: dto.name,
        categ_id: dto.categ_id,
        product_type: 'standard',
        product_kind: dto.product_kind ?? 'part',
        odoo_type: dto.odoo_type ?? 'product',
        sale_ok: dto.sale_ok,
        purchase_ok: dto.purchase_ok,
        cost_raw_material: dto.cost_raw_material,
        cost_transport: dto.cost_transport,
        cost_production: dto.cost_production,
        cost_warehouse: dto.cost_warehouse,
        variant_attributes: dto.variant_attributes as Prisma.InputJsonValue ?? undefined,
        stock_policy: dto.stock_policy,
        reorder_min: dto.reorder_min,
        reorder_max: dto.reorder_max,
        attributes: (dto.attributes as Prisma.InputJsonValue) ?? {},
        state: 'draft',
        create_uid: userId,
        write_uid: userId,
      },
      include: { category: true },
    })

    await this.mail.log({
      model: 'product',
      res_id: product.id,
      message_type: 'audit',
      subject: 'Product Created (Standard)',
      body: `Standard product ${product.product_code} created`,
      author_id: userId,
    })

    return product
  }

  private async createCustom(dto: CreateCustomProductDto, userId: number) {
    await validateCustomProduct(this.prisma, {
      project_id: dto.project_id,
      erection_zone_id: dto.erection_zone_id,
      mark_prefix: dto.mark_prefix,
      mark_number: dto.mark_number,
      engineer_hours_est: dto.engineer_hours_est,
    })

    const productCode = await this.codeGen.generate('CUS')

    const product = await this.prisma.products.create({
      data: {
        product_code: productCode,
        name: dto.name,
        categ_id: dto.categ_id,
        product_type: 'custom',
        project_id: dto.project_id,
        erection_zone_id: dto.erection_zone_id,
        mark_prefix: dto.mark_prefix,
        mark_number: dto.mark_number,
        engineer_hours_est: dto.engineer_hours_est,
        attributes: (dto.attributes as Prisma.InputJsonValue) ?? {},
        state: 'draft',
        create_uid: userId,
        write_uid: userId,
      },
      include: {
        category: true,
        project: { select: { id: true, project_code: true, name: true } },
        erection_zone: { select: { id: true, code: true, label: true } },
        mark: true,
      },
    })

    await this.mail.log({
      model: 'product',
      res_id: product.id,
      message_type: 'audit',
      subject: 'Product Created (Custom)',
      body: `Custom product ${product.product_code} created — mark: ${dto.mark_prefix}-${dto.mark_number}`,
      author_id: userId,
    })

    return product
  }

  async findAll(query: QueryProductDto) {
    const { product_type, state, categ_id, project_id, q, page = 1, limit = 20 } = query
    const skip = (page - 1) * limit

    const where: Prisma.productsWhereInput = {
      active: true,
      ...(product_type ? { product_type } : {}),
      ...(state ? { state } : {}),
      ...(categ_id ? { categ_id } : {}),
      ...(project_id ? { project_id } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { product_code: { contains: q, mode: 'insensitive' } },
              { engineering_code: { contains: q, mode: 'insensitive' } },
              { item_code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.products.count({ where }),
      this.prisma.products.findMany({
        where,
        skip,
        take: limit,
        orderBy: { write_date: 'desc' },
        include: {
          category: { select: { id: true, name: true, prefix_5: true } },
          project: { select: { id: true, project_code: true, name: true } },
          erection_zone: { select: { id: true, code: true, label: true } },
          mark: { select: { code: true, label: true, category: true } },
          write_user: { select: { id: true, name: true } },
        },
      }),
    ])

    return { total, page, limit, pages: Math.ceil(total / limit), items }
  }

  async findOne(product_code: string) {
    const product = await this.prisma.products.findUnique({
      where: { product_code },
      include: {
        category: true,
        project: { select: { id: true, project_code: true, name: true } },
        erection_zone: { select: { id: true, code: true, label: true } },
        mark: true,
        create_user: { select: { id: true, name: true } },
        write_user: { select: { id: true, name: true } },
      },
    })
    if (!product) throw new NotFoundException(`Product ${product_code} not found`)
    return product
  }

  async update(product_code: string, dto: UpdateProductDto, userId: number) {
    const product = await this.findOne(product_code)

    const tracking: { field: string; old_value: unknown; new_value: unknown }[] = []
    for (const key of Object.keys(dto) as (keyof UpdateProductDto)[]) {
      const old = (product as any)[key]
      const nw = (dto as any)[key]
      if (old !== nw) tracking.push({ field: key, old_value: old, new_value: nw })
    }

    const updated = await this.prisma.products.update({
      where: { product_code },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.sale_ok !== undefined ? { sale_ok: dto.sale_ok } : {}),
        ...(dto.purchase_ok !== undefined ? { purchase_ok: dto.purchase_ok } : {}),
        ...(dto.cost_raw_material !== undefined ? { cost_raw_material: dto.cost_raw_material } : {}),
        ...(dto.cost_transport !== undefined ? { cost_transport: dto.cost_transport } : {}),
        ...(dto.cost_production !== undefined ? { cost_production: dto.cost_production } : {}),
        ...(dto.cost_warehouse !== undefined ? { cost_warehouse: dto.cost_warehouse } : {}),
        ...(dto.variant_attributes ? { variant_attributes: dto.variant_attributes as Prisma.InputJsonValue } : {}),
        ...(dto.attributes ? { attributes: dto.attributes as Prisma.InputJsonValue } : {}),
        ...(dto.engineer_hours_est !== undefined ? { engineer_hours_est: dto.engineer_hours_est } : {}),
        write_uid: userId,
        write_date: new Date(),
      },
      include: { category: true },
    })

    if (tracking.length) {
      await this.mail.log({
        model: 'product',
        res_id: product.id,
        message_type: 'audit',
        subject: 'Product Updated',
        body: `${tracking.length} field(s) changed`,
        tracking,
        author_id: userId,
      })
    }

    return updated
  }

  async doAction(product_code: string, action: string, userId: number) {
    const product = await this.findOne(product_code)
    const targetState = PRODUCT_ACTIONS[action]
    if (!targetState) throw new UnprocessableEntityException(`Unknown action: ${action}`)
    assertProductTransition(product.state, targetState)

    const updated = await this.prisma.products.update({
      where: { product_code },
      data: { state: targetState, write_uid: userId, write_date: new Date() },
    })

    await this.mail.log({
      model: 'product',
      res_id: product.id,
      message_type: 'notification',
      subject: `State: ${product.state} → ${targetState}`,
      body: `Action '${action}' executed`,
      tracking: [{ field: 'state', old_value: product.state, new_value: targetState }],
      author_id: userId,
    })

    return updated
  }

  getMessages(product_code: string) {
    return this.prisma.products
      .findUnique({ where: { product_code }, select: { id: true } })
      .then(p => {
        if (!p) throw new NotFoundException(`Product ${product_code} not found`)
        return this.mail.thread('product', p.id)
      })
  }
}
