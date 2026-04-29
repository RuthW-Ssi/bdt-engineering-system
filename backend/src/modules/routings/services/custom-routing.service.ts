import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'

const CUSTOM_OP_INCLUDE = {
  workcenter: { select: { id: true, code: true, name: true } },
  activities: { orderBy: { sequence: 'asc' as const } },
} as const

@Injectable()
export class CustomRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async findByProduct(productCode: string) {
    const product = await this.requireProduct(productCode)
    if (!product.has_custom_routing) return null

    return this.prisma.custom_routing.findUnique({
      where: { product_id: product.id },
      include: { ops: { orderBy: { sequence: 'asc' }, include: CUSTOM_OP_INCLUDE } },
    })
  }

  async create(productCode: string, fromTemplateId: number | undefined, userId: number) {
    const product = await this.requireProduct(productCode)

    if (product.has_custom_routing) {
      throw new ConflictException(`Product ${productCode} already has a custom routing`)
    }

    const templateId = fromTemplateId ?? product.routing_template_id ?? null

    const customRouting = await this.prisma.custom_routing.create({
      data: {
        product_id: product.id,
        name: `Custom routing — ${productCode}`,
        state: 'draft',
        cloned_from_template_id: templateId,
        create_uid: userId,
        write_uid: userId,
      },
    })

    if (templateId) {
      await this.cloneTemplateOps(customRouting.id, templateId)
    }

    await this.prisma.products.update({
      where: { id: product.id },
      data: { has_custom_routing: true, routing_template_id: null },
    })

    await this.mail.log({
      model: 'product', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: `Custom routing created${templateId ? ` (cloned from template ${templateId})` : ''}`,
    })

    return this.prisma.custom_routing.findUniqueOrThrow({
      where: { id: customRouting.id },
      include: { ops: { orderBy: { sequence: 'asc' }, include: CUSTOM_OP_INCLUDE } },
    })
  }

  async addOp(productCode: string, dto: { sequence?: number; name: string; op_code: string; workcenter_id: number }, userId: number) {
    const product = await this.requireProduct(productCode)
    const cr = await this.requireCustomRouting(product.id)

    const maxSeq = await this.prisma.custom_routing_op.aggregate({
      where: { custom_routing_id: cr.id },
      _max: { sequence: true },
    })

    return this.prisma.custom_routing_op.create({
      data: {
        custom_routing_id: cr.id,
        sequence: dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10),
        name: dto.name,
        op_code: dto.op_code,
        workcenter_id: dto.workcenter_id,
      },
      include: CUSTOM_OP_INCLUDE,
    })
  }

  async updateOp(productCode: string, opId: number, dto: { name?: string; sequence?: number; workcenter_id?: number }) {
    const product = await this.requireProduct(productCode)
    const cr = await this.requireCustomRouting(product.id)

    const op = await this.prisma.custom_routing_op.findFirst({
      where: { id: opId, custom_routing_id: cr.id },
    })
    if (!op) throw new NotFoundException(`Op ${opId} not found in custom routing`)

    return this.prisma.custom_routing_op.update({
      where: { id: opId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sequence !== undefined && { sequence: dto.sequence }),
        ...(dto.workcenter_id !== undefined && { workcenter_id: dto.workcenter_id }),
      },
      include: CUSTOM_OP_INCLUDE,
    })
  }

  async deleteOp(productCode: string, opId: number) {
    const product = await this.requireProduct(productCode)
    const cr = await this.requireCustomRouting(product.id)

    const op = await this.prisma.custom_routing_op.findFirst({
      where: { id: opId, custom_routing_id: cr.id },
    })
    if (!op) throw new NotFoundException(`Op ${opId} not found in custom routing`)

    await this.prisma.custom_routing_op.delete({ where: { id: opId } })
    return { deleted: true }
  }

  async addActivity(
    productCode: string,
    opId: number,
    dto: {
      description: string
      per_minute: number
      formula_param_code: string
      std_measure: number
      unit: string
      manpower?: number
      workcenter_id: number
      sequence?: number
    },
  ) {
    const product = await this.requireProduct(productCode)
    const cr = await this.requireCustomRouting(product.id)

    const op = await this.prisma.custom_routing_op.findFirst({
      where: { id: opId, custom_routing_id: cr.id },
    })
    if (!op) throw new NotFoundException(`Op ${opId} not found in custom routing`)

    const maxSeq = await this.prisma.custom_routing_activity.aggregate({
      where: { op_id: opId },
      _max: { sequence: true },
    })

    return this.prisma.custom_routing_activity.create({
      data: {
        op_id: opId,
        sequence: dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10),
        description: dto.description,
        per_minute: dto.per_minute,
        formula_param_code: dto.formula_param_code,
        std_measure: dto.std_measure,
        unit: dto.unit,
        manpower: dto.manpower ?? 1,
        workcenter_id: dto.workcenter_id,
      },
    })
  }

  async updateActivity(productCode: string, opId: number, actId: number, dto: Partial<{
    description: string; per_minute: number; std_measure: number; manpower: number; sequence: number
  }>) {
    const product = await this.requireProduct(productCode)
    const cr = await this.requireCustomRouting(product.id)

    const op = await this.prisma.custom_routing_op.findFirst({ where: { id: opId, custom_routing_id: cr.id } })
    if (!op) throw new NotFoundException(`Op ${opId} not found`)

    const act = await this.prisma.custom_routing_activity.findFirst({ where: { id: actId, op_id: opId } })
    if (!act) throw new NotFoundException(`Activity ${actId} not found`)

    return this.prisma.custom_routing_activity.update({ where: { id: actId }, data: dto })
  }

  async deleteActivity(productCode: string, opId: number, actId: number) {
    const product = await this.requireProduct(productCode)
    const cr = await this.requireCustomRouting(product.id)

    const op = await this.prisma.custom_routing_op.findFirst({ where: { id: opId, custom_routing_id: cr.id } })
    if (!op) throw new NotFoundException(`Op ${opId} not found`)

    const act = await this.prisma.custom_routing_activity.findFirst({ where: { id: actId, op_id: opId } })
    if (!act) throw new NotFoundException(`Activity ${actId} not found`)

    await this.prisma.custom_routing_activity.delete({ where: { id: actId } })
    return { deleted: true }
  }

  async restoreToTemplate(productCode: string, templateId: number, userId: number) {
    const product = await this.requireProduct(productCode)
    if (!product.has_custom_routing) throw new BadRequestException('Product does not have custom routing')

    const template = await this.prisma.routing_template.findUnique({ where: { id: templateId } })
    if (!template) throw new NotFoundException(`Routing template ${templateId} not found`)

    const cr = await this.prisma.custom_routing.findUnique({ where: { product_id: product.id } })
    if (cr) {
      await this.prisma.custom_routing.update({
        where: { id: cr.id },
        data: { state: 'obsolete', write_uid: userId, write_date: new Date() },
      })
    }

    await this.prisma.products.update({
      where: { id: product.id },
      data: { has_custom_routing: false, routing_template_id: templateId },
    })

    await this.mail.log({
      model: 'product', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: `Custom routing obsoleted; restored to template ${template.code}`,
    })
  }

  private async cloneTemplateOps(customRoutingId: number, templateId: number) {
    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: templateId },
      orderBy: { sequence: 'asc' },
      include: { op_activities: { include: { activity_template: true } } },
    })

    for (const op of ops) {
      const customOp = await this.prisma.custom_routing_op.create({
        data: {
          custom_routing_id: customRoutingId,
          sequence: op.sequence,
          name: op.name,
          op_code: op.op_code,
          workcenter_id: op.workcenter_id,
        },
      })

      for (const opAct of op.op_activities) {
        const tpl = opAct.activity_template
        await this.prisma.custom_routing_activity.create({
          data: {
            op_id: customOp.id,
            sequence: opAct.sequence,
            description: tpl.description,
            per_minute: tpl.per_minute,
            formula_param_code: tpl.formula_param_code,
            std_measure: tpl.std_measure,
            unit: tpl.unit,
            manpower: tpl.manpower,
            workcenter_id: tpl.workcenter_id,
          },
        })
      }
    }
  }

  private async requireProduct(productCode: string) {
    const p = await this.prisma.products.findUnique({
      where: { product_code: productCode },
      select: { id: true, product_code: true, routing_template_id: true, has_custom_routing: true },
    })
    if (!p) throw new NotFoundException(`Product "${productCode}" not found`)
    return p
  }

  private async requireCustomRouting(productId: number) {
    const cr = await this.prisma.custom_routing.findUnique({ where: { product_id: productId } })
    if (!cr) throw new NotFoundException(`No custom routing for product ${productId}`)
    return cr
  }
}
