import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { MoCodeGenerator } from '../mo-code.generator'
import { groupBomPartsBySize, PART_SOURCES, PartLineInput, PartSource, validatePartLines } from './part-lines'

export interface CreateMoPartInput {
  project_id: number
  primary_mark_prefix_code: string
  routing_template_id: number
  part_source: PartSource
  source_filename?: string | null
  plan_start?: string
  plan_finish?: string
  confirm?: boolean
  part_lines: PartLineInput[]
}

export type UpdateMoPartInput = Pick<CreateMoPartInput, 'primary_mark_prefix_code' | 'routing_template_id' | 'plan_start' | 'plan_finish' | 'part_lines'>

function assertLines(lines: PartLineInput[], source: PartSource) {
  const errors = validatePartLines(lines)
  if (errors.length) throw new BadRequestException(errors)
  if (source !== 'BOM_PART_LIST' && lines.some(l => l.bom_part_ids?.length)) {
    throw new BadRequestException('bom_part_ids are only allowed when part_source is BOM_PART_LIST')
  }
}

function toLineRows(lines: PartLineInput[]) {
  return lines.map((l, i) => ({
    line_seq: i,
    profile: l.profile.trim(),
    grade: l.grade.trim(),
    length_mm: new Prisma.Decimal(l.length_mm),
    qty: new Prisma.Decimal(l.qty),
    unit_weight_kg: l.unit_weight_kg == null ? null : new Prisma.Decimal(l.unit_weight_kg),
    part_mark: l.part_mark ? l.part_mark.slice(0, 60) : null,
    bom_part_ids: l.bom_part_ids ?? [],
  }))
}

// MO Part (wiki features/mo-part-import-plan): size-based lines pre-filled
// from one source, then freely edited. Kept apart from ManufacturingOrderService so the assembly MO path
// stays untouched.
@Injectable()
export class MoPartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
    private readonly codeGen: MoCodeGenerator,
  ) {}

  async create(input: CreateMoPartInput, userId: number, userName: string) {
    if (!PART_SOURCES.includes(input.part_source)) throw new BadRequestException(`Unknown part_source ${input.part_source}`)
    assertLines(input.part_lines, input.part_source)
    const project = await this.prisma.project.findUnique({ where: { id: input.project_id } })
    if (!project) throw new NotFoundException(`Project ${input.project_id} not found`)
    await this.assertPrefixAndRouting(input.primary_mark_prefix_code, input.routing_template_id)

    const status = input.confirm === true ? 'CONFIRMED' : 'DRAFT'
    const mo = await this.prisma.$transaction(async (tx) => {
      const mo_code = await this.codeGen.generate(tx)
      const created = await tx.manufacturing_order.create({
        data: {
          mo_code,
          kind: 'PART',
          project_id: input.project_id,
          part_source: input.part_source,
          primary_mark_prefix_code: input.primary_mark_prefix_code,
          routing_template_id: input.routing_template_id,
          status,
          plan_start: input.plan_start ? new Date(input.plan_start) : null,
          plan_finish: input.plan_finish ? new Date(input.plan_finish) : null,
          create_uid: userId,
          write_uid: userId,
          part_lines: { create: toLineRows(input.part_lines) },
        },
      })
      if (status === 'CONFIRMED') {
        await tx.mo_status_history.create({
          data: { mo_id: created.id, from_status: 'DRAFT', to_status: 'CONFIRMED', reason: 'Created with Save + Confirm', changed_by: userName },
        })
      }
      return created
    })

    const file = input.source_filename ? ` · file "${input.source_filename}"` : ''
    await this.mail.log({
      model: 'manufacturing_order',
      res_id: mo.id,
      author_id: userId,
      message_type: 'audit',
      subject: `MO ${mo.mo_code} created (${status}) · MO Part · source ${input.part_source}${file}`,
    })
    return { id: mo.id, mo_code: mo.mo_code }
  }

  // D8: DRAFT MO Parts are editable (header + full line replace). project_id
  // and part_source stay as created.
  async update(id: number, input: UpdateMoPartInput, userId: number) {
    const mo = await this.prisma.manufacturing_order.findUnique({ where: { id } })
    if (!mo) throw new NotFoundException(`MO ${id} not found`)
    if (mo.kind !== 'PART') throw new ConflictException(`MO ${id} is not an MO Part`)
    if (mo.status !== 'DRAFT') throw new ConflictException(`Only DRAFT MOs can be edited (current: ${mo.status})`)
    assertLines(input.part_lines, mo.part_source as PartSource)
    await this.assertPrefixAndRouting(input.primary_mark_prefix_code, input.routing_template_id)

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.mo_part_line.deleteMany({ where: { mo_id: id } })
      await tx.mo_part_line.createMany({ data: toLineRows(input.part_lines).map(r => ({ ...r, mo_id: id })) })
      return tx.manufacturing_order.update({
        where: { id },
        data: {
          primary_mark_prefix_code: input.primary_mark_prefix_code,
          routing_template_id: input.routing_template_id,
          plan_start: input.plan_start ? new Date(input.plan_start) : null,
          plan_finish: input.plan_finish ? new Date(input.plan_finish) : null,
          write_uid: userId,
        },
      })
    })
    await this.mail.log({
      model: 'manufacturing_order',
      res_id: id,
      author_id: userId,
      message_type: 'audit',
      subject: `MO ${updated.mo_code} edited · ${input.part_lines.length} part lines`,
    })
    return { id: updated.id, mo_code: updated.mo_code }
  }

  private async assertPrefixAndRouting(prefixCode: string, routingId: number) {
    const [prefix, template] = await Promise.all([
      this.prisma.mark_prefix_master.findUnique({ where: { code: prefixCode } }),
      this.prisma.routing_template.findUnique({ where: { id: routingId } }),
    ])
    if (!prefix) throw new NotFoundException(`Mark prefix ${prefixCode} not found`)
    if (!template) throw new NotFoundException(`Routing template ${routingId} not found`)
  }

  async bomPartLines(dispatchId: number, slot?: 'MAIN' | 'ACC') {
    const dispatch = await this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId }, select: { id: true } })
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)
    const parts = await this.prisma.bom_part.findMany({
      where: { dispatch_id: dispatchId, status: 'ACTIVE', ...(slot ? { slot } : {}) },
      select: { id: true, part_mark: true, profile: true, grade: true, length_mm: true, qty: true, weight_kg: true },
      orderBy: { part_mark: 'asc' },
    })
    return groupBomPartsBySize(parts.map(p => ({
      ...p,
      length_mm: p.length_mm == null ? null : Number(p.length_mm),
      qty: p.qty == null ? null : Number(p.qty),
      weight_kg: p.weight_kg == null ? null : Number(p.weight_kg),
    })))
  }
}
