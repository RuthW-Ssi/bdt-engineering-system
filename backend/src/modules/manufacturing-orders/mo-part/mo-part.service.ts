import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { MoCodeGenerator } from '../mo-code.generator'
import { groupBomPartsBySize, PART_SOURCES, PartLineInput, PartMarkInput, PartSource, validateMarks, validatePartLines } from './part-lines'
import { diffMoPart, MoPartSnapshot } from './mo-part-diff'

export interface SourceFileInput {
  kind: PartSource
  filename: string
}

export interface CreateMoPartInput {
  project_id: number
  zone_id: number
  sub_zone_id?: number | null
  // Both automatic for MO Part (user, 2026-10-06): prefix OTH, routing = the
  // active `PART` template if one exists, else none.
  primary_mark_prefix_code?: string
  routing_template_id?: number | null
  part_sources: PartSource[]
  source_files?: SourceFileInput[]
  plan_start?: string
  plan_finish?: string
  confirm?: boolean
  part_marks?: PartMarkInput[]
  part_lines: PartLineInput[]
}

export interface UpdateMoPartInput {
  primary_mark_prefix_code?: string
  routing_template_id?: number | null
  plan_start?: string
  plan_finish?: string
  part_marks?: PartMarkInput[]
  part_lines: PartLineInput[]
  part_sources?: PartSource[]
  source_files?: SourceFileInput[]
  note?: string
}

const PART_PREFIX = 'OTH'
const PART_ROUTING_CODE = 'PART'

const dec = (v: number | null | undefined) => (v == null ? null : new Prisma.Decimal(v))
const num = (v: unknown) => (v == null ? null : Number(v))

function assertInput(marks: PartMarkInput[], lines: PartLineInput[], sources: string[]) {
  // Marks alone are a valid MO Part (R1: plates filled in later).
  const lineErrors = marks.length && !lines.length ? [] : validatePartLines(lines, marks.map(m => m.mark.trim()))
  const errors = [...validateMarks(marks), ...lineErrors]
  if (errors.length) throw new BadRequestException(errors)
  if (!sources.includes('BOM_PART_LIST') && lines.some(l => l.bom_part_ids?.length)) {
    throw new BadRequestException('bom_part_ids are only allowed when BOM_PART_LIST is a source')
  }
}

function assertSources(sources: string[] | undefined, required: boolean) {
  if (required && !sources?.length) throw new BadRequestException('At least one source is required')
  const bad = (sources ?? []).find(s => !PART_SOURCES.includes(s as PartSource))
  if (bad) throw new BadRequestException(`Unknown source ${bad}`)
}

const stampFiles = (files: SourceFileInput[] | undefined) => (files ?? []).map(f => ({ kind: f.kind, filename: f.filename, at: new Date().toISOString() }))

function markRows(moId: number, marks: PartMarkInput[]) {
  return marks.map(m => ({
    mo_id: moId,
    mark: m.mark.trim(),
    set_qty: new Prisma.Decimal(m.set_qty),
    length_mm: dec(m.length_mm), width_mm: dec(m.width_mm), height_mm: dec(m.height_mm),
    weight_kg: dec(m.weight_kg), tw_mm: dec(m.tw_mm), tf_mm: dec(m.tf_mm),
  }))
}

function lineRows(moId: number, lines: PartLineInput[], markIds: Map<string, number>) {
  return lines.map((l, i) => ({
    mo_id: moId,
    line_seq: i,
    mark_id: l.mark ? markIds.get(l.mark) ?? null : null,
    profile: l.profile.trim(),
    grade: l.grade.trim(),
    length_mm: new Prisma.Decimal(l.length_mm),
    qty: new Prisma.Decimal(l.qty),
    unit_weight_kg: dec(l.unit_weight_kg),
    part_mark: l.part_mark ? l.part_mark.slice(0, 60) : null,
    bom_part_ids: l.bom_part_ids ?? [],
    holes: l.holes ?? [],
    cut_length_mm: dec(l.cut_length_mm),
  }))
}

// MO Part (wiki features/mo-part-import-plan §10): marks + plate lines from
// Dispatch Note / Material List / BOM / NC / manual, editable in any status
// except CANCELLED; every save that changes something is logged field by field.
@Injectable()
export class MoPartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
    private readonly codeGen: MoCodeGenerator,
  ) {}

  async create(input: CreateMoPartInput, userId: number, userName: string) {
    assertSources(input.part_sources, true)
    const marks = input.part_marks ?? []
    assertInput(marks, input.part_lines, input.part_sources)
    const project = await this.prisma.project.findUnique({ where: { id: input.project_id } })
    if (!project) throw new NotFoundException(`Project ${input.project_id} not found`)
    await this.assertZone(input.project_id, input.zone_id, input.sub_zone_id)
    await this.assertBomPartsInZone(input.part_lines, input.project_id, input.zone_id)
    const prefixCode = input.primary_mark_prefix_code ?? PART_PREFIX
    const routingId = input.routing_template_id !== undefined ? input.routing_template_id : await this.defaultPartRouting()
    await this.assertPrefixAndRouting(prefixCode, routingId)

    const status = input.confirm === true ? 'CONFIRMED' : 'DRAFT'
    const files = stampFiles(input.source_files)
    const mo = await this.prisma.$transaction(async (tx) => {
      const mo_code = await this.codeGen.generate(tx)
      const created = await tx.manufacturing_order.create({
        data: {
          mo_code,
          kind: 'PART',
          project_id: input.project_id,
          zone_id: input.zone_id,
          sub_zone_id: input.sub_zone_id ?? null,
          part_sources: [...new Set(input.part_sources)],
          source_files: files,
          primary_mark_prefix_code: prefixCode,
          routing_template_id: routingId,
          status,
          plan_start: input.plan_start ? new Date(input.plan_start) : null,
          plan_finish: input.plan_finish ? new Date(input.plan_finish) : null,
          create_uid: userId,
          write_uid: userId,
        },
      })
      await this.writeMarksAndLines(tx, created.id, marks, input.part_lines)
      if (status === 'CONFIRMED') {
        await tx.mo_status_history.create({
          data: { mo_id: created.id, from_status: 'DRAFT', to_status: 'CONFIRMED', reason: 'Created with Save + Confirm', changed_by: userName },
        })
      }
      await tx.mo_part_change.create({ data: { mo_id: created.id, changed_by: userName, note: 'created', changes: [] } })
      return created
    })

    const fileText = files.length ? ` · files ${files.map(f => f.filename).join(', ')}` : ''
    await this.mail.log({
      model: 'manufacturing_order',
      res_id: mo.id,
      author_id: userId,
      message_type: 'audit',
      subject: `MO ${mo.mo_code} created (${status}) · MO Part · ${[...new Set(input.part_sources)].join(', ')}${fileText}`,
    })
    return { id: mo.id, mo_code: mo.mo_code }
  }

  // R2: any status except CANCELLED. Project stays fixed (P1). The status
  // check, the before-snapshot and the writes share one transaction.
  async update(id: number, input: UpdateMoPartInput, userId: number, userName: string) {
    assertSources(input.part_sources, false)
    const marks = input.part_marks ?? []

    const result = await this.prisma.$transaction(async (tx) => {
      // Row lock: a concurrent cancel or a second save waits for this one, so
      // the status check and the delete/insert below can't interleave.
      await tx.$queryRaw`SELECT id FROM manufacturing_order WHERE id = ${id} FOR UPDATE`
      const mo = await tx.manufacturing_order.findUnique({
        where: { id },
        include: { part_marks: true, part_lines: { orderBy: { line_seq: 'asc' }, include: { mark: { select: { mark: true } } } } },
      })
      if (!mo) throw new NotFoundException(`MO ${id} not found`)
      if (mo.kind !== 'PART') throw new ConflictException(`MO ${id} is not an MO Part`)
      if (mo.status === 'CANCELLED') throw new ConflictException('A cancelled MO Part cannot be edited')

      const sources = [...new Set([...(mo.part_sources ?? []), ...(input.part_sources ?? [])])]
      assertInput(marks, input.part_lines, sources)
      if (mo.project_id != null) await this.assertBomPartsInZone(input.part_lines, mo.project_id, mo.zone_id)
      const prefixCode = input.primary_mark_prefix_code ?? mo.primary_mark_prefix_code
      const routingId = input.routing_template_id !== undefined ? input.routing_template_id : mo.routing_template_id
      await this.assertPrefixAndRouting(prefixCode, routingId)

      const header = (m: { primary_mark_prefix_code?: string; routing_template_id?: number | null; plan_start?: Date | string | null; plan_finish?: Date | string | null }) => ({
        primary_mark_prefix_code: m.primary_mark_prefix_code,
        routing_template_id: m.routing_template_id,
        plan_start: m.plan_start ? new Date(m.plan_start) : null,
        plan_finish: m.plan_finish ? new Date(m.plan_finish) : null,
      })
      const before: MoPartSnapshot = {
        header: header(mo),
        marks: mo.part_marks.map(m => ({
          mark: m.mark, set_qty: Number(m.set_qty), length_mm: num(m.length_mm), width_mm: num(m.width_mm), height_mm: num(m.height_mm),
          weight_kg: num(m.weight_kg), tw_mm: num(m.tw_mm), tf_mm: num(m.tf_mm),
        })),
        lines: mo.part_lines.map(l => ({
          mark: l.mark?.mark ?? null, part_mark: l.part_mark, profile: l.profile, grade: l.grade, length_mm: Number(l.length_mm), qty: Number(l.qty),
          unit_weight_kg: num(l.unit_weight_kg), cut_length_mm: num(l.cut_length_mm), holes: (l.holes as never) ?? [], bom_part_ids: l.bom_part_ids,
        })),
      }
      const after: MoPartSnapshot = { header: header({ ...input, primary_mark_prefix_code: prefixCode, routing_template_id: routingId }), marks, lines: input.part_lines }
      const changes = diffMoPart(before, after)

      await tx.mo_part_line.deleteMany({ where: { mo_id: id } })
      await tx.mo_part_mark.deleteMany({ where: { mo_id: id } })
      await this.writeMarksAndLines(tx, id, marks, input.part_lines)
      const updated = await tx.manufacturing_order.update({
        where: { id },
        data: {
          ...header({ ...input, primary_mark_prefix_code: prefixCode, routing_template_id: routingId }),
          part_sources: sources,
          source_files: [...((mo.source_files as unknown[]) ?? []), ...stampFiles(input.source_files)] as Prisma.InputJsonValue,
          write_uid: userId,
        },
      })
      if (changes.length) {
        await tx.mo_part_change.create({
          data: { mo_id: id, changed_by: userName, note: input.note?.trim() || null, changes: changes as unknown as Prisma.InputJsonValue },
        })
      }
      return { updated, count: changes.length }
    })

    await this.mail.log({
      model: 'manufacturing_order',
      res_id: id,
      author_id: userId,
      message_type: 'audit',
      subject: `MO ${result.updated.mo_code} edited · ${result.count} change${result.count === 1 ? '' : 's'}`,
    })
    return { id: result.updated.id, mo_code: result.updated.mo_code }
  }

  history(id: number) {
    return this.prisma.mo_part_change.findMany({ where: { mo_id: id }, orderBy: { id: 'desc' } })
  }

  private async writeMarksAndLines(tx: Prisma.TransactionClient, moId: number, marks: PartMarkInput[], lines: PartLineInput[]) {
    const created = marks.length
      ? await tx.mo_part_mark.createManyAndReturn({ data: markRows(moId, marks), select: { id: true, mark: true } })
      : []
    const ids = new Map(created.map(m => [m.mark, m.id]))
    if (lines.length) await tx.mo_part_line.createMany({ data: lineRows(moId, lines, ids) })
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

  // One MO Part = one zone of its project (sub-zone optional); fixed after create.
  private async assertZone(projectId: number, zoneId: number, subZoneId?: number | null) {
    const zone = await this.prisma.project_zone.findFirst({ where: { id: zoneId, project_id: projectId }, select: { id: true } })
    if (!zone) throw new BadRequestException(`Zone ${zoneId} is not in project ${projectId}`)
    if (subZoneId != null) {
      const sub = await this.prisma.sub_zone.findFirst({ where: { id: subZoneId, zone_id: zoneId }, select: { id: true } })
      if (!sub) throw new BadRequestException(`Sub-zone ${subZoneId} is not in zone ${zoneId}`)
    }
  }

  // bom_part_ids are traceability refs — they must be real parts of this MO's
  // own zone (an MO Part saved before zones existed: its project).
  private async assertBomPartsInZone(lines: PartLineInput[], projectId: number, zoneId: number | null) {
    const ids = [...new Set(lines.flatMap(l => l.bom_part_ids ?? []))]
    if (!ids.length) return
    const dispatch = zoneId != null ? { project_id: projectId, zone_id: zoneId } : { project_id: projectId }
    const found = await this.prisma.bom_part.findMany({ where: { id: { in: ids }, dispatch }, select: { id: true } })
    const ok = new Set(found.map(p => p.id))
    const missing = ids.filter(id => !ok.has(id))
    if (missing.length) throw new BadRequestException(`bom_part_ids not found in this ${zoneId != null ? 'zone' : 'project'}: ${missing.join(', ')}`)
  }
  private async defaultPartRouting(): Promise<number | null> {
    const t = await this.prisma.routing_template.findFirst({ where: { code: PART_ROUTING_CODE, active: true }, select: { id: true } })
    return t?.id ?? null
  }

  private async assertPrefixAndRouting(prefixCode: string, routingId: number | null) {
    const [prefix, template] = await Promise.all([
      this.prisma.mark_prefix_master.findUnique({ where: { code: prefixCode } }),
      routingId == null ? null : this.prisma.routing_template.findUnique({ where: { id: routingId } }),
    ])
    if (!prefix) throw new NotFoundException(`Mark prefix ${prefixCode} not found`)
    if (routingId != null && !template) throw new NotFoundException(`Routing template ${routingId} not found`)
  }
}
