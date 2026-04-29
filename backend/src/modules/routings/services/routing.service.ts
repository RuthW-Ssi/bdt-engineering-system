import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { CreateRoutingDto } from '../dto/create-routing.dto'
import { AddOperationDto } from '../dto/add-operation.dto'
import { ReorderOperationsDto } from '../dto/reorder-operations.dto'
import { UpdateOperationDto } from '../dto/update-operation.dto'

// ── Activity select shape reused across queries ──────────────────
const ACT_TEMPLATE_SELECT = {
  id: true, op_code: true, description: true,
  per_minute: true, std_measure: true, unit: true,
  formula_param_code: true, manpower: true,
} as const

const OP_INCLUDE = {
  workcenter: { select: { id: true, code: true, name: true } },
  op_activities: {
    orderBy: { sequence: 'asc' as const },
    include: { activity_template: { select: ACT_TEMPLATE_SELECT } },
  },
} as const

@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  // ── findByProduct: returns merged view (template ops + product overrides) ──
  async findByProduct(productCode: string) {
    const product = await this.requireProduct(productCode)

    if (!product.routing_template_id) {
      if (product.has_custom_routing) {
        // Custom routing path — return empty (caller should use CustomRoutingService)
        return []
      }
      return []
    }

    const template = await this.prisma.routing_template.findUnique({
      where: { id: product.routing_template_id },
      select: { id: true, code: true, state: true },
    })
    if (!template) return []

    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: template.id },
      orderBy: { sequence: 'asc' },
      include: {
        workcenter: { select: { id: true, code: true, name: true } },
        op_activities: {
          orderBy: { sequence: 'asc' },
          include: { activity_template: { select: ACT_TEMPLATE_SELECT } },
        },
      },
    })

    // Load all product overrides indexed by activity_template_id
    const overrides = await this.prisma.product_routing_override.findMany({
      where: { product_id: product.id },
    })
    const overrideMap = new Map(overrides.map(o => [o.activity_template_id, o]))

    // Return RoutingOpDTO-compatible shape (merge overrides inline)
    return ops.map(op => ({
      id: op.id,
      product_id: null as number | null,
      routing_template: template.code,
      op_code: op.op_code,
      name: op.name,
      sequence: op.sequence,
      state: template.state,
      time_cycle: op.time_cycle,
      last_computed_at: op.last_computed_at?.toISOString() ?? null,
      workcenter: op.workcenter,
      activities: op.op_activities.map(a => {
        const ovr = overrideMap.get(a.activity_template_id)
        return {
          id: a.id,
          routing_workcenter_id: a.routing_workcenter_id,
          activity_template_id: a.activity_template_id,
          sequence: a.sequence,
          per_minute_override: ovr?.override_per_minute ?? null,
          std_measure_override: ovr?.override_std_measure ?? null,
          manpower_override: ovr?.override_manpower ?? null,
          last_cycle_time_min: null as number | null,
          last_input_snapshot: null as Record<string, unknown> | null,
          activity_template: a.activity_template,
        }
      }),
    }))
  }

  async findOne(id: number) {
    const op = await this.prisma.mrp_routing_workcenter.findUnique({
      where: { id },
      include: {
        workcenter: true,
        op_activities: { orderBy: { sequence: 'asc' }, include: { activity_template: true } },
      },
    })
    if (!op) throw new NotFoundException(`Routing operation ${id} not found`)
    return op
  }

  // listTemplates: returns routing_template rows (not mrp_routing_workcenter)
  async listTemplates() {
    return this.prisma.routing_template.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
      include: {
        operations: {
          orderBy: { sequence: 'asc' },
          include: { workcenter: { select: { id: true, code: true, name: true } } },
        },
      },
    })
  }

  // create: binds product to a template (or creates custom routing stub)
  async create(productCode: string, dto: CreateRoutingDto, userId: number) {
    const product = await this.requireProduct(productCode)

    if (product.routing_template_id) {
      throw new ConflictException(
        `Product ${productCode} is already bound to a routing template. Use /routing-overrides or /custom-routing instead.`,
      )
    }

    if (dto.from_template) {
      const tpl = await this.prisma.routing_template.findUnique({
        where: { code: dto.from_template },
      })
      if (!tpl) throw new NotFoundException(`Routing template "${dto.from_template}" not found`)

      await this.prisma.products.update({
        where: { id: product.id },
        data: { routing_template_id: tpl.id },
      })

      await this.mail.log({
        model: 'product', res_id: product.id, author_id: userId,
        message_type: 'audit', subject: `Routing bound to template: ${dto.from_template}`,
      })

      return this.findByProduct(productCode)
    }

    throw new BadRequestException('Provide from_template to bind product to a routing template')
  }

  // addOperation: adds op to a TEMPLATE (admin operation)
  async addOperation(productCode: string, dto: AddOperationDto, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) {
      throw new BadRequestException('Product has no routing template bound')
    }

    const template = await this.prisma.routing_template.findUnique({
      where: { id: product.routing_template_id },
    })
    if (!template || template.state === 'obsolete') {
      throw new BadRequestException('Cannot add operations to an obsolete template')
    }

    const maxSeq = await this.prisma.mrp_routing_workcenter.aggregate({
      where: { template_id: template.id },
      _max: { sequence: true },
    })

    const op = await this.prisma.mrp_routing_workcenter.create({
      data: {
        template_id: template.id,
        op_code: dto.op_code,
        name: dto.name ?? dto.op_code,
        sequence: dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10),
        workcenter_id: dto.workcenter_id,
        create_uid: userId,
        write_uid: userId,
      },
      include: { workcenter: true, op_activities: true },
    })

    if (dto.activity_template_ids?.length) {
      for (let i = 0; i < dto.activity_template_ids.length; i++) {
        await this.prisma.routing_op_activity.create({
          data: {
            routing_workcenter_id: op.id,
            activity_template_id: dto.activity_template_ids[i],
            sequence: (i + 1) * 10,
          },
        })
      }
    }

    return this.findOne(op.id)
  }

  async deleteOperation(productCode: string, opId: number, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) throw new BadRequestException('Product has no routing template')

    const op = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { id: opId, template_id: product.routing_template_id },
    })
    if (!op) throw new NotFoundException(`Operation ${opId} not found in template`)

    await this.prisma.mrp_routing_workcenter.delete({ where: { id: opId } })
    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: `Template operation deleted: op ${opId}`,
    })
    return { deleted: true }
  }

  async reorder(productCode: string, dto: ReorderOperationsDto, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) throw new BadRequestException('Product has no routing template')

    for (const item of dto.items) {
      await this.prisma.mrp_routing_workcenter.updateMany({
        where: { id: item.id, template_id: product.routing_template_id },
        data: { sequence: item.sequence, write_uid: userId, write_date: new Date() },
      })
    }

    return this.findByProduct(productCode)
  }

  async activate(productCode: string, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) {
      throw new BadRequestException('Product has no routing template bound')
    }

    const template = await this.prisma.routing_template.findUnique({
      where: { id: product.routing_template_id },
    })
    if (!template) throw new NotFoundException('Routing template not found')
    if (template.state === 'active') throw new ConflictException('Routing template is already active')

    await this.prisma.routing_template.update({
      where: { id: template.id },
      data: { state: 'active', write_uid: userId, write_date: new Date() },
    })

    await this.mail.log({
      model: 'routing_template', res_id: template.id, author_id: userId,
      message_type: 'audit', subject: `Routing template activated: ${template.code}`,
    })
    return this.findByProduct(productCode)
  }

  async obsolete(productCode: string, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) {
      throw new BadRequestException('Product has no routing template bound')
    }

    const template = await this.prisma.routing_template.findUnique({
      where: { id: product.routing_template_id },
    })
    if (!template) throw new NotFoundException('Routing template not found')

    await this.prisma.routing_template.update({
      where: { id: template.id },
      data: { state: 'obsolete', write_uid: userId, write_date: new Date() },
    })

    await this.mail.log({
      model: 'routing_template', res_id: template.id, author_id: userId,
      message_type: 'audit', subject: `Routing template obsoleted: ${template.code}`,
    })
    return this.findByProduct(productCode)
  }

  async updateOperation(productCode: string, opId: number, dto: UpdateOperationDto, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) throw new BadRequestException('Product has no routing template')

    const op = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { id: opId, template_id: product.routing_template_id },
    })
    if (!op) throw new NotFoundException(`Operation ${opId} not found in template`)

    return this.prisma.mrp_routing_workcenter.update({
      where: { id: opId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sequence !== undefined && { sequence: dto.sequence }),
        ...(dto.workcenter_id !== undefined && { workcenter_id: dto.workcenter_id }),
        write_uid: userId,
        write_date: new Date(),
      },
      include: {
        workcenter: { select: { id: true, code: true, name: true } },
        op_activities: {
          orderBy: { sequence: 'asc' },
          include: { activity_template: { select: ACT_TEMPLATE_SELECT } },
        },
      },
    })
  }

  // addStepActivity: adds junction row to template op
  async addStepActivity(productCode: string, opId: number, dto: { activity_template_id: number; sequence?: number }, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) throw new BadRequestException('Product has no routing template')

    const op = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { id: opId, template_id: product.routing_template_id },
    })
    if (!op) throw new NotFoundException(`Operation ${opId} not found in template`)

    const tpl = await this.prisma.routing_activity_template.findUnique({ where: { id: dto.activity_template_id } })
    if (!tpl) throw new NotFoundException(`Activity template ${dto.activity_template_id} not found`)

    const maxSeq = await this.prisma.routing_op_activity.aggregate({
      where: { routing_workcenter_id: opId },
      _max: { sequence: true },
    })
    const seq = dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10)

    return this.prisma.routing_op_activity.create({
      data: { routing_workcenter_id: opId, activity_template_id: dto.activity_template_id, sequence: seq },
      include: { activity_template: { select: ACT_TEMPLATE_SELECT } },
    })
  }

  async deleteStepActivity(productCode: string, opId: number, stepId: number, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.routing_template_id) throw new BadRequestException('Product has no routing template')

    const junction = await this.prisma.routing_op_activity.findFirst({
      where: { id: stepId, routing_workcenter_id: opId },
    })
    if (!junction) throw new NotFoundException(`Activity junction ${stepId} not found`)

    await this.prisma.routing_op_activity.delete({ where: { id: stepId } })
    return { deleted: true }
  }

  async findProductId(productCode: string): Promise<number> {
    const p = await this.requireProduct(productCode)
    return p.id
  }

  private async requireProduct(productCode: string) {
    const p = await this.prisma.products.findUnique({
      where: { product_code: productCode },
      select: { id: true, product_code: true, routing_template_id: true, has_custom_routing: true },
    })
    if (!p) throw new NotFoundException(`Product "${productCode}" not found`)
    return p
  }
}
