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
import { UpdateActivityOverrideDto, AddStepActivityDto } from '../dto/update-activity-override.dto'

@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async findByProduct(productCode: string) {
    const product = await this.requireProduct(productCode)
    return this.prisma.mrp_routing_workcenter.findMany({
      where: { product_id: product.id },
      orderBy: { sequence: 'asc' },
      include: {
        workcenter: { select: { id: true, code: true, name: true } },
        activities: {
          orderBy: { sequence: 'asc' },
          include: {
            activity_template: {
              select: {
                id: true, op_code: true, description: true,
                per_minute: true, std_measure: true, unit: true,
                formula_param_code: true, manpower: true,
              },
            },
          },
        },
      },
    })
  }

  async findOne(id: number) {
    const op = await this.prisma.mrp_routing_workcenter.findUnique({
      where: { id },
      include: {
        workcenter: true,
        activities: { orderBy: { sequence: 'asc' }, include: { activity_template: true } },
      },
    })
    if (!op) throw new NotFoundException(`Routing operation ${id} not found`)
    return op
  }

  async listTemplates() {
    return this.prisma.mrp_routing_workcenter.findMany({
      where: { product_id: null },
      orderBy: { sequence: 'asc' },
      include: {
        workcenter: { select: { id: true, code: true, name: true } },
        activities: { orderBy: { sequence: 'asc' }, include: { activity_template: true } },
      },
    })
  }

  async create(productCode: string, dto: CreateRoutingDto, userId: number) {
    const product = await this.requireProduct(productCode)

    // Check no active routing exists for this product
    const active = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { product_id: product.id, state: 'active' },
    })
    if (active) {
      throw new ConflictException(
        `Product ${productCode} already has an active routing (op id=${active.id}). Obsolete it first.`,
      )
    }

    // Check no draft ops already exist (one routing per product)
    const existingDraft = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { product_id: product.id, state: 'draft' },
    })
    if (existingDraft) {
      throw new ConflictException(
        `Product ${productCode} already has draft routing operations. Delete them before creating new ones.`,
      )
    }

    // Load template ops if routing_template provided
    let templateOps: { op_code: string; name: string; sequence: number; workcenter_id: number; activities: any[] }[] = []
    if (dto.from_template) {
      const tplOps = await this.prisma.mrp_routing_workcenter.findMany({
        where: { routing_template: dto.from_template, product_id: null },
        orderBy: { sequence: 'asc' },
        include: { activities: { include: { activity_template: true } } },
      })
      templateOps = tplOps.map(t => ({
        op_code: t.op_code,
        name: t.name,
        sequence: t.sequence,
        workcenter_id: t.workcenter_id,
        activities: t.activities,
      }))
    } else if (dto.operations?.length) {
      // Explicit ops provided
      templateOps = dto.operations.map((o, i) => ({
        op_code: o.op_code,
        name: o.name ?? o.op_code,
        sequence: o.sequence ?? (i + 1) * 10,
        workcenter_id: o.workcenter_id,
        activities: [],
      }))
    }

    const created: { id: number }[] = []
    for (const op of templateOps) {
      const newOp = await this.prisma.mrp_routing_workcenter.create({
        data: {
          product_id: product.id,
          op_code: op.op_code,
          name: op.name,
          sequence: op.sequence,
          workcenter_id: op.workcenter_id,
          state: 'draft',
          create_uid: userId,
          write_uid: userId,
        },
      })

      // Copy template activities as step-activities
      for (const step of op.activities) {
        await this.prisma.routing_step_activity.create({
          data: {
            routing_workcenter_id: newOp.id,
            activity_template_id: step.activity_template_id,
            sequence: step.sequence,
          },
        })
      }
      created.push(newOp)
    }

    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: 'Routing created',
      tracking: [{ field: 'op_count', old_value: 0, new_value: created.length }],
    })

    return created
  }

  async addOperation(productCode: string, dto: AddOperationDto, userId: number) {
    const product = await this.requireProduct(productCode)
    this.assertNoneActive(product.id)

    const op = await this.prisma.mrp_routing_workcenter.create({
      data: {
        product_id: product.id,
        op_code: dto.op_code,
        name: dto.name ?? dto.op_code,
        sequence: dto.sequence ?? 10,
        workcenter_id: dto.workcenter_id,
        state: 'draft',
        create_uid: userId,
        write_uid: userId,
      },
      include: { workcenter: true, activities: true },
    })

    if (dto.activity_template_ids?.length) {
      for (let i = 0; i < dto.activity_template_ids.length; i++) {
        await this.prisma.routing_step_activity.create({
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
    const op = await this.requireOp(opId, product.id)

    if (op.state !== 'draft') {
      throw new BadRequestException(`Cannot delete operation in state "${op.state}"`)
    }

    await this.prisma.mrp_routing_workcenter.delete({ where: { id: opId } })
    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: 'Operation deleted',
      tracking: [{ field: 'op_id', old_value: opId, new_value: null }],
    })
    return { deleted: true }
  }

  async reorder(productCode: string, dto: ReorderOperationsDto, userId: number) {
    const product = await this.requireProduct(productCode)

    for (const item of dto.items) {
      await this.prisma.mrp_routing_workcenter.updateMany({
        where: { id: item.id, product_id: product.id },
        data: { sequence: item.sequence, write_uid: userId, write_date: new Date() },
      })
    }

    return this.findByProduct(productCode)
  }

  async activate(productCode: string, userId: number) {
    const product = await this.requireProduct(productCode)
    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { product_id: product.id },
    })

    if (ops.length === 0) throw new BadRequestException('No routing operations to activate')

    const drafts = ops.filter(o => o.state === 'draft')
    if (drafts.length === 0) throw new ConflictException('Routing already active or obsolete')

    const alreadyActive = ops.find(o => o.state === 'active')
    if (alreadyActive) {
      throw new ConflictException(
        `Routing already has active operation (id=${alreadyActive.id}). Obsolete it first.`,
      )
    }

    await this.prisma.mrp_routing_workcenter.updateMany({
      where: { product_id: product.id, state: 'draft' },
      data: { state: 'active', write_uid: userId, write_date: new Date() },
    })

    // Set products.active_routing_id to first op
    const firstOp = ops[0]
    await this.prisma.products.update({
      where: { id: product.id },
      data: { active_routing_id: firstOp.id },
    })

    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: 'Routing activated',
    })
    return this.findByProduct(productCode)
  }

  async obsolete(productCode: string, userId: number) {
    const product = await this.requireProduct(productCode)

    await this.prisma.mrp_routing_workcenter.updateMany({
      where: { product_id: product.id, state: { in: ['draft', 'active'] } },
      data: { state: 'obsolete', write_uid: userId, write_date: new Date() },
    })

    await this.prisma.products.update({
      where: { id: product.id },
      data: { active_routing_id: null },
    })

    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: 'Routing obsoleted',
    })
    return this.findByProduct(productCode)
  }

  // ── RT9: Update operation (name / sequence / workcenter) ───────

  async updateOperation(productCode: string, opId: number, dto: UpdateOperationDto, userId: number) {
    const product = await this.requireProduct(productCode)
    const op = await this.requireOp(opId, product.id)
    if (op.state !== 'draft') {
      throw new BadRequestException(`Cannot edit operation in state "${op.state}"`)
    }

    const updated = await this.prisma.mrp_routing_workcenter.update({
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
        activities: {
          orderBy: { sequence: 'asc' },
          include: {
            activity_template: {
              select: {
                id: true, op_code: true, description: true,
                per_minute: true, std_measure: true, unit: true,
                formula_param_code: true, manpower: true,
              },
            },
          },
        },
      },
    })

    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: `Operation updated: ${updated.name}`,
      tracking: Object.entries(dto)
        .filter(([, v]) => v !== undefined)
        .map(([field, new_value]) => ({ field, old_value: (op as any)[field], new_value })),
    })
    return updated
  }

  // ── RT11: Activity override (per-product step overrides) ────────

  async updateActivityOverride(
    productCode: string,
    opId: number,
    stepId: number,
    dto: UpdateActivityOverrideDto,
    userId: number,
  ) {
    const product = await this.requireProduct(productCode)
    const op = await this.requireOp(opId, product.id)
    if (op.state !== 'draft') {
      throw new BadRequestException(`Cannot override activities on routing in state "${op.state}"`)
    }

    const step = await this.prisma.routing_step_activity.findFirst({
      where: { id: stepId, routing_workcenter_id: opId },
    })
    if (!step) throw new NotFoundException(`Step activity ${stepId} not found on operation ${opId}`)

    const updated = await this.prisma.routing_step_activity.update({
      where: { id: stepId },
      data: {
        per_minute_override: dto.per_minute_override ?? null,
        std_measure_override: dto.std_measure_override ?? null,
        manpower_override: dto.manpower_override ?? null,
        last_cycle_time_min: null,
        last_computed_at: null,
      },
      include: {
        activity_template: {
          select: {
            id: true, op_code: true, description: true,
            per_minute: true, std_measure: true, unit: true,
            formula_param_code: true, manpower: true,
          },
        },
      },
    })

    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit',
      subject: `Activity override updated: step ${stepId} on op ${opId}`,
      tracking: [
        { field: 'per_minute_override', old_value: step.per_minute_override, new_value: dto.per_minute_override ?? null },
        { field: 'std_measure_override', old_value: step.std_measure_override, new_value: dto.std_measure_override ?? null },
        { field: 'manpower_override', old_value: step.manpower_override, new_value: dto.manpower_override ?? null },
      ],
    })
    return updated
  }

  async addStepActivity(
    productCode: string,
    opId: number,
    dto: AddStepActivityDto,
    userId: number,
  ) {
    const product = await this.requireProduct(productCode)
    const op = await this.requireOp(opId, product.id)
    if (op.state !== 'draft') {
      throw new BadRequestException(`Cannot add activities to routing in state "${op.state}"`)
    }

    const tpl = await this.prisma.routing_activity_template.findUnique({
      where: { id: dto.activity_template_id },
    })
    if (!tpl) throw new NotFoundException(`Activity template ${dto.activity_template_id} not found`)

    const maxSeq = await this.prisma.routing_step_activity.aggregate({
      where: { routing_workcenter_id: opId },
      _max: { sequence: true },
    })
    const seq = dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10)

    const step = await this.prisma.routing_step_activity.create({
      data: {
        routing_workcenter_id: opId,
        activity_template_id: dto.activity_template_id,
        sequence: seq,
      },
      include: {
        activity_template: {
          select: {
            id: true, op_code: true, description: true,
            per_minute: true, std_measure: true, unit: true,
            formula_param_code: true, manpower: true,
          },
        },
      },
    })

    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit',
      subject: `Activity added to op ${opId}: template ${dto.activity_template_id}`,
    })
    return step
  }

  async deleteStepActivity(
    productCode: string,
    opId: number,
    stepId: number,
    userId: number,
  ) {
    const product = await this.requireProduct(productCode)
    const op = await this.requireOp(opId, product.id)
    if (op.state !== 'draft') {
      throw new BadRequestException(`Cannot remove activities from routing in state "${op.state}"`)
    }

    const step = await this.prisma.routing_step_activity.findFirst({
      where: { id: stepId, routing_workcenter_id: opId },
    })
    if (!step) throw new NotFoundException(`Step activity ${stepId} not found`)

    await this.prisma.routing_step_activity.delete({ where: { id: stepId } })
    await this.mail.log({
      model: 'mrp_routing', res_id: product.id, author_id: userId,
      message_type: 'audit', subject: `Activity removed: step ${stepId} from op ${opId}`,
    })
    return { deleted: true }
  }

  async findProductId(productCode: string): Promise<number> {
    const p = await this.requireProduct(productCode)
    return p.id
  }

  private async requireProduct(productCode: string) {
    const p = await this.prisma.products.findUnique({
      where: { product_code: productCode },
      select: { id: true, product_code: true },
    })
    if (!p) throw new NotFoundException(`Product "${productCode}" not found`)
    return p
  }

  private async requireOp(opId: number, productId: number) {
    const op = await this.prisma.mrp_routing_workcenter.findUnique({ where: { id: opId } })
    if (!op || op.product_id !== productId) {
      throw new NotFoundException(`Routing operation ${opId} not found for this product`)
    }
    return op
  }

  private async assertNoneActive(productId: number) {
    const active = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { product_id: productId, state: 'active' },
    })
    if (active) {
      throw new ConflictException('Cannot modify an active routing. Obsolete it first.')
    }
  }
}
