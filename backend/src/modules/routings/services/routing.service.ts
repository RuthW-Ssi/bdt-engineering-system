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
import { UpsertTemplateSnapshotDto } from '../dto/upsert-template-snapshot.dto'


@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async findByProduct(productCode: string) {
    const product = await this.requireProduct(productCode)

    if (!product.routing_template_id) return []

    const template = await this.prisma.routing_template.findUnique({
      where: { id: product.routing_template_id },
      select: { id: true, code: true, state: true },
    })
    if (!template) return []

    const ops = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: template.id },
      orderBy: { sequence: 'asc' },
      include: { workcenter: { select: { id: true, code: true, name: true } } },
    })

    return ops.map(op => ({
      id: op.id,
      product_id: null as number | null,
      routing_template_id: template.id,
      routing_template: template.code,
      op_code: op.op_code,
      name: op.name,
      sequence: op.sequence,
      state: template.state,
      time_cycle: op.time_cycle,
      last_computed_at: op.last_computed_at?.toISOString() ?? null,
      workcenter: op.workcenter,
      activities: [] as unknown[],
    }))
  }

  async findOne(id: number) {
    const op = await this.prisma.mrp_routing_workcenter.findUnique({
      where: { id },
      include: { workcenter: true },
    })
    if (!op) throw new NotFoundException(`Routing operation ${id} not found`)
    return op
  }

  // listTemplates: returns routing_template rows (not mrp_routing_workcenter)
  async listTemplates() {
    const rows = await this.prisma.routing_template.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      include: {
        _count: { select: { operations: true, bound_products: true } },
      },
    })
    return rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      state: r.state,
      applies_to_product_type: r.applies_to_product_type,
      write_date: r.write_date,
      operation_count: r._count.operations,
      bound_product_count: r._count.bound_products,
    }))
  }

  /**
   * T-MO.05 · MO form Section 3. Suggest routing templates that match the chosen
   * mark prefix. Two signals (in priority order):
   *   1) routing_template_binding_rule.match_mark_prefix  (explicit rules)
   *   2) routing_template.applies_to_product_type === prefix code  (the actual
   *      mapping in current data — binding rules are empty)
   * Returns { suggested, others } — `others` is the override list (FE hides it
   * behind a "Show all" toggle). Both share listTemplates() item shape.
   */
  async suggestByMarkPrefix(markPrefix: string) {
    const rules = await this.prisma.routing_template_binding_rule.findMany({
      where: { active: true, NOT: { match_mark_prefix: null } },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    })
    const suggestedIds: number[] = []
    const push = (id: number) => {
      if (!suggestedIds.includes(id)) suggestedIds.push(id)
    }
    for (const r of rules) {
      if (r.match_mark_prefix && markPrefix.startsWith(r.match_mark_prefix)) push(r.routing_template_id)
    }

    const templates = await this.listTemplates()
    // primary signal in current data: template targets this mark prefix directly
    for (const t of templates) {
      if (t.applies_to_product_type === markPrefix) push(t.id)
    }

    const byId = new Map(templates.map((t) => [t.id, t]))
    const suggested = suggestedIds
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
    const suggestedSet = new Set(suggested.map((t) => t.id))
    const others = templates.filter((t) => !suggestedSet.has(t.id))
    return { suggested, others }
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

  // getTemplateById: returns full template with ops + activities (used by RoutingBuilder edit mode)
  async getTemplateById(id: number) {
    const template = await this.prisma.routing_template.findUniqueOrThrow({
      where: { id },
      include: {
        operations: {
          orderBy: { sequence: 'asc' },
          include: {
            workcenter: { select: { id: true, code: true, name: true } },
            op_type: { select: { id: true, key: true, label: true, color: true, method_options: true } },
          },
        },
      },
    })

    // Collect all machine/tool IDs from activities_snapshot to resolve names in one query
    const machineIds = new Set<number>()
    const toolIds = new Set<number>()
    for (const op of template.operations) {
      const snap = op.activities_snapshot as any[]
      if (!Array.isArray(snap)) continue
      for (const act of snap) {
        if (act.machine_id != null) machineIds.add(act.machine_id)
        if (Array.isArray(act.tool_ids)) act.tool_ids.forEach((tid: number) => toolIds.add(tid))
      }
    }

    const allIds = [...machineIds, ...toolIds]
    const resources = allIds.length
      ? await this.prisma.equipment_resource.findMany({
          where: { id: { in: allIds } },
          select: { id: true, code: true, name: true },
        })
      : []
    const resourceMap = new Map(resources.map(r => [r.id, r]))

    const operations = template.operations.map(op => {
      const snap = op.activities_snapshot as any[]
      const activities_snapshot = Array.isArray(snap)
        ? snap.map(act => ({
            ...act,
            machine_name: act.machine_id != null ? (resourceMap.get(act.machine_id)?.name ?? null) : null,
            tool_names: Array.isArray(act.tool_ids)
              ? act.tool_ids.map((tid: number) => resourceMap.get(tid)?.name ?? `#${tid}`)
              : [],
          }))
        : snap
      return { ...op, activities_snapshot }
    })

    return { ...template, operations }
  }

  async findOperationsLibrary(search?: string) {
    const where = search
      ? { OR: [
          { name:    { contains: search, mode: 'insensitive' as const } },
          { op_code: { contains: search, mode: 'insensitive' as const } },
        ] }
      : undefined
    return this.prisma.mrp_routing_workcenter.findMany({
      where,
      include: {
        workcenter: { select: { id: true, code: true, name: true } },
        op_type:    { select: { id: true, key: true, label: true, color: true } },
        template:   { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ op_type_id: 'asc' }, { name: 'asc' }],
      take: 300,
    })
  }

  // deleteTemplateOperation: remove op from template by id
  async deleteTemplateOperation(templateId: number, opId: number) {
    const op = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { id: opId, template_id: templateId },
    })
    if (!op) throw new NotFoundException(`Operation ${opId} not found on template ${templateId}`)
    await this.prisma.mrp_routing_workcenter.delete({ where: { id: opId } })
  }

  // upsertTemplateSnapshot: single-transaction full save from RoutingBuilder canvas.
  // Replaces the old multi-call flow (PATCH meta + DELETE ops + PATCH/POST each op + reorder + PATCH edges).
  async upsertTemplateSnapshot(templateId: number, dto: UpsertTemplateSnapshotDto, userId: number) {
    const template = await this.prisma.routing_template.findUnique({ where: { id: templateId } })
    if (!template) throw new NotFoundException(`Template ${templateId} not found`)
    if (template.state === 'obsolete') throw new BadRequestException('Cannot edit an obsolete template')

    return this.prisma.$transaction(async (tx) => {
      const incomingIds = dto.operations.filter(o => o.id != null).map(o => o.id!)

      // 1. Remove ops that were deleted from the canvas
      await tx.mrp_routing_workcenter.deleteMany({
        where: { template_id: templateId, id: { notIn: incomingIds.length ? incomingIds : [0] } },
      })

      // 2. Clear all remaining sequences to negative temps so final assignments never conflict
      const remaining = await tx.mrp_routing_workcenter.findMany({
        where: { template_id: templateId },
        select: { id: true },
      })
      for (const op of remaining) {
        await tx.mrp_routing_workcenter.update({ where: { id: op.id }, data: { sequence: -(op.id) } })
      }

      // 3. Upsert each op in sequence order; build client_ref → 'op-{realId}' map for edge translation
      const refMap = new Map<string, string>([['start', 'start'], ['end', 'end']])
      for (const op of dto.operations) {
        const activitiesSnap = op.activities != null ? (op.activities as object[]) : []
        if (op.id != null) {
          await tx.mrp_routing_workcenter.update({
            where: { id: op.id },
            data: {
              op_code: op.op_code, name: op.name, sequence: op.sequence,
              workcenter_id: op.workcenter_id, op_type_id: op.op_type_id ?? null,
              method: op.method ?? null, time_mode: op.time_mode,
              time_cycle_manual: op.time_cycle_manual ?? null,
              formula_expr: op.formula_expr ?? null,
              canvas_x: op.canvas_x ?? null, canvas_y: op.canvas_y ?? null,
              activities_snapshot: activitiesSnap,
              write_uid: userId, write_date: new Date(),
            },
          })
          refMap.set(op.client_ref, `op-${op.id}`)
        } else {
          const created = await tx.mrp_routing_workcenter.create({
            data: {
              template_id: templateId, op_code: op.op_code, name: op.name, sequence: op.sequence,
              workcenter_id: op.workcenter_id, op_type_id: op.op_type_id ?? null,
              method: op.method ?? null, time_mode: op.time_mode,
              time_cycle_manual: op.time_cycle_manual ?? null,
              formula_expr: op.formula_expr ?? null,
              canvas_x: op.canvas_x ?? null, canvas_y: op.canvas_y ?? null,
              activities_snapshot: activitiesSnap,
              create_uid: userId, write_uid: userId,
            },
          })
          refMap.set(op.client_ref, `op-${created.id}`)
        }
      }

      // 4. Translate edge client_refs to real op-IDs and discard edges with unresolved refs
      const translatedEdges = dto.canvas_edges
        .filter(e => refMap.has(e.source) && refMap.has(e.target))
        .map(e => ({
          source: refMap.get(e.source)!,
          target: refMap.get(e.target)!,
          ...(e.sourceHandle !== undefined && { sourceHandle: e.sourceHandle }),
          ...(e.targetHandle !== undefined && { targetHandle: e.targetHandle }),
          ...(e.label !== undefined && { label: e.label }),
          ...(e.midOffsetX && { midOffsetX: e.midOffsetX }),
          ...(e.midOffsetY && { midOffsetY: e.midOffsetY }),
        }))

      // 5. Persist template metadata + translated edges in one update
      await tx.routing_template.update({
        where: { id: templateId },
        data: {
          name: dto.name,
          applies_to_product_type: dto.applies_to_product_type ?? null,
          bg_image_url: dto.bg_image_url ?? null,
          bg_rotation: dto.bg_rotation ?? 270,
          bg_scale: dto.bg_scale ?? 1.6,
          canvas_edges: translatedEdges as object[],
          write_uid: userId, write_date: new Date(),
        },
      })

      // Return ref_map so frontend can update temp node IDs after creating new template
      return {
        ok: true,
        ref_map: Object.fromEntries(
          [...refMap.entries()].filter(([k]) => k !== 'start' && k !== 'end'),
        ),
      }
    })
  }

  // reorderTemplateOperations: reassign all sequences without unique-constraint conflicts.
  // PostgreSQL checks the unique constraint after EACH row in a single UPDATE, so a direct swap fails.
  // Solution: two-phase update inside a transaction — first move every op to a guaranteed-unique
  // negative temp value, then set the real target values.
  async reorderTemplateOperations(templateId: number, items: { id: number; sequence: number }[]) {
    if (items.length === 0) return { ok: true }
    await this.prisma.$transaction(async (tx) => {
      // Phase 1: clear to negative temps (op id negated — globally unique within any template)
      for (const item of items) {
        await tx.mrp_routing_workcenter.update({
          where: { id: item.id },
          data: { sequence: -(item.id) },
        })
      }
      // Phase 2: set final sequences
      for (const item of items) {
        await tx.mrp_routing_workcenter.update({
          where: { id: item.id },
          data: { sequence: item.sequence },
        })
      }
    })
    return { ok: true }
  }

  // updateTemplateOperation: patch op fields + re-sync activity links
  async updateTemplateOperation(templateId: number, opId: number, dto: UpdateOperationDto, userId: number) {
    const op = await this.prisma.mrp_routing_workcenter.findFirst({
      where: { id: opId, template_id: templateId },
    })
    if (!op) throw new NotFoundException(`Operation ${opId} not found on template ${templateId}`)

    const { activity_template_ids, ...opFields } = dto

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.mrp_routing_workcenter.update({
        where: { id: opId },
        data: { ...opFields, write_uid: userId, write_date: new Date() },
        include: { workcenter: { select: { id: true, code: true, name: true } } },
      })
      return updated
    })
  }

  // addOperationToTemplate: adds op directly by template id (used by RoutingBuilder)
  async addOperationToTemplate(templateId: number, dto: AddOperationDto, userId: number) {
    const template = await this.prisma.routing_template.findUnique({ where: { id: templateId } })
    if (!template) throw new NotFoundException(`Template ${templateId} not found`)
    if (template.state === 'obsolete') throw new BadRequestException('Cannot add operations to an obsolete template')

    const maxSeq = await this.prisma.mrp_routing_workcenter.aggregate({
      where: { template_id: templateId },
      _max: { sequence: true },
    })

    return this.prisma.$transaction(async (tx) => {
      return tx.mrp_routing_workcenter.create({
        data: {
          template_id: templateId,
          op_code: dto.op_code,
          name: dto.name ?? dto.op_code,
          sequence: dto.sequence ?? ((maxSeq._max.sequence ?? 0) + 10),
          workcenter_id: dto.workcenter_id,
          op_type_id: dto.op_type_id ?? null,
          method: dto.method ?? null,
          time_mode: dto.time_mode ?? 'formula',
          time_cycle_manual: dto.time_cycle_manual ?? null,
          formula_expr: dto.formula_expr ?? null,
          canvas_x: dto.canvas_x ?? null,
          canvas_y: dto.canvas_y ?? null,
          create_uid: userId,
          write_uid: userId,
        },
        include: {
          workcenter: { select: { id: true, code: true, name: true } },
          op_type: { select: { id: true, key: true, label: true, color: true, method_options: true } },
        },
      })
    })
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
      include: { workcenter: true },
    })

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
      },
    })
  }

  async findProductId(productCode: string): Promise<number> {
    const p = await this.requireProduct(productCode)
    return p.id
  }

  private async requireProduct(productCode: string) {
    const p = await this.prisma.products.findUnique({
      where: { product_code: productCode },
      select: { id: true, product_code: true, routing_template_id: true },
    })
    if (!p) throw new NotFoundException(`Product "${productCode}" not found`)
    return p
  }
}
