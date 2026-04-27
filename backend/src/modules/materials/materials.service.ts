import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailMessageService } from '../mail/mail-message.service'
import { MasterDataService } from '../master-data/master-data.service'
import { CreateMaterialDto } from './dto/create-material.dto'
import { UpdateMaterialDto } from './dto/update-material.dto'
import { QueryMaterialDto } from './dto/query-material.dto'
import { PartCodeGenerator } from './part-code.generator'
import { DuplicateDetectorService } from './validators/duplicate-detector.service'
import { validateDescription } from './validators/description.validator'
import { validateAttributes } from './validators/attributes-by-group.schemas'
import { assertTransition, STATE_ACTIONS } from './materials.state-machine'
import type { Prisma } from '@prisma/client'

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
    private readonly masterData: MasterDataService,
    private readonly partCode: PartCodeGenerator,
    private readonly dupDetector: DuplicateDetectorService,
  ) {}

  // ── C1: Description validation ──────────────────────────────
  private guardDescription(desc: string) {
    const { ok, error } = validateDescription(desc)
    if (!ok) throw new UnprocessableEntityException(error)
  }

  // ── C2: UoM FK ────────────────────────────────────────────
  private async guardUom(id: number) {
    const uom = await this.masterData.findUomById(id)
    if (!uom || !uom.active) throw new UnprocessableEntityException(`uom_id ${id} not found or inactive`)
  }

  // ── C3: Category FK ───────────────────────────────────────
  private async guardCategory(id: number) {
    const cat = await this.masterData.findCategoryById(id)
    if (!cat || !cat.active) throw new UnprocessableEntityException(`categ_id ${id} not found or inactive`)
    return cat
  }

  // ── B1: POST /materials ───────────────────────────────────
  async create(dto: CreateMaterialDto, userId: number) {
    this.guardDescription(dto.description_sale)
    await this.guardUom(dto.uom_id)
    const cat = await this.guardCategory(dto.categ_id)

    // C5: Attributes validation
    if (cat.prefix_5 && dto.attributes) {
      const { ok, error } = validateAttributes(cat.prefix_5, dto.attributes)
      if (!ok) throw new UnprocessableEntityException(error)
    }

    // Criticality required for Spare Part / Fixed Asset
    if (cat.needs_criticality && !dto.criticality) {
      throw new UnprocessableEntityException('criticality (A/B/C) is required for this category')
    }

    const pendingCode = this.partCode.pendingCode(cat.prefix_5 ?? 'XXXXX')

    // Check for concurrent pending codes (allow multiple pending per prefix in draft state)
    const existingPending = await this.prisma.materials.count({
      where: { default_code: pendingCode, state: 'draft' },
    })

    let codeToUse = pendingCode
    if (existingPending > 0) {
      // Use a temp unique code with timestamp suffix until run number assigned
      codeToUse = `${(cat.prefix_5 ?? 'XXXXX').substring(0, 4)}${Date.now().toString().slice(-5)}`
      // Ensure exactly 10 chars
      codeToUse = codeToUse.substring(0, 10).padEnd(10, '0')
    }

    const material = await this.prisma.materials.create({
      data: {
        default_code: codeToUse,
        name: dto.name,
        description_sale: dto.description_sale,
        categ_id: dto.categ_id,
        uom_id: dto.uom_id,
        uom_po_id: dto.uom_po_id ?? dto.uom_id,
        type: dto.type ?? 'product',
        state: 'draft',
        attributes: (dto.attributes as Prisma.InputJsonValue) ?? {},
        drawing_ref: dto.drawing_ref,
        bim_object_id: dto.bim_object_id,
        total_weight_kg: dto.total_weight_kg,
        criticality: dto.criticality,
        version: '1.0.0',
        create_uid: userId,
        write_uid: userId,
      },
      include: { category: true, uom: true, create_user: { select: { id: true, name: true } } },
    })

    await this.mail.log({
      res_id: material.id,
      message_type: 'audit',
      subject: 'Material Created',
      body: `Material ${material.default_code} created`,
      author_id: userId,
    })

    // C4: Duplicate detection (warning, not block)
    const duplicates = await this.dupDetector.detect(dto.categ_id, (dto.attributes as Record<string, unknown>) ?? {}, material.id)

    return { ...material, duplicates }
  }

  // ── B5: GET /materials ────────────────────────────────────
  async findAll(query: QueryMaterialDto) {
    const { state, categ_id, q, page = 1, limit = 20 } = query
    const skip = (page - 1) * limit

    const where: Prisma.materialsWhereInput = {
      active: true,
      ...(state ? { state } : {}),
      ...(categ_id ? { categ_id } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description_sale: { contains: q, mode: 'insensitive' } },
              { default_code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.materials.count({ where }),
      this.prisma.materials.findMany({
        where,
        skip,
        take: limit,
        orderBy: { write_date: 'desc' },
        include: {
          category: { select: { id: true, name: true, prefix_5: true, group_no: true } },
          uom: { select: { id: true, name: true } },
          write_user: { select: { id: true, name: true } },
        },
      }),
    ])

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      items,
    }
  }

  // ── GET /materials/:default_code ──────────────────────────
  async findOne(default_code: string) {
    const mat = await this.prisma.materials.findUnique({
      where: { default_code },
      include: {
        category: true,
        uom: true,
        uom_po: true,
        create_user: { select: { id: true, name: true } },
        write_user: { select: { id: true, name: true } },
      },
    })
    if (!mat) throw new NotFoundException(`Material ${default_code} not found`)
    return mat
  }

  // ── B3: PATCH /materials/:default_code ───────────────────
  async update(default_code: string, dto: UpdateMaterialDto, userId: number) {
    const mat = await this.findOne(default_code)

    if (dto.description_sale) this.guardDescription(dto.description_sale)
    if (dto.uom_id) await this.guardUom(dto.uom_id)

    // Build tracking diff
    const tracking: { field: string; old_value: unknown; new_value: unknown }[] = []
    for (const key of Object.keys(dto) as (keyof UpdateMaterialDto)[]) {
      const old = (mat as any)[key]
      const nw = (dto as any)[key]
      if (old !== nw) tracking.push({ field: key, old_value: old, new_value: nw })
    }

    const updated = await this.prisma.materials.update({
      where: { default_code },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description_sale ? { description_sale: dto.description_sale } : {}),
        ...(dto.uom_id ? { uom_id: dto.uom_id } : {}),
        ...(dto.attributes ? { attributes: dto.attributes as Prisma.InputJsonValue } : {}),
        ...(dto.drawing_ref !== undefined ? { drawing_ref: dto.drawing_ref } : {}),
        ...(dto.criticality ? { criticality: dto.criticality } : {}),
        write_uid: userId,
        write_date: new Date(),
      },
      include: { category: true, uom: true },
    })

    if (tracking.length) {
      await this.mail.log({
        res_id: mat.id,
        message_type: 'audit',
        subject: 'Material Updated',
        body: `${tracking.length} field(s) changed`,
        tracking,
        author_id: userId,
      })
    }

    return updated
  }

  // ── B4: POST /materials/:default_code/action_* ────────────
  async doAction(default_code: string, action: string, userId: number) {
    const mat = await this.findOne(default_code)
    const targetState = STATE_ACTIONS[action]
    if (!targetState) throw new UnprocessableEntityException(`Unknown action: ${action}`)
    assertTransition(mat.state, targetState)

    const updated = await this.prisma.materials.update({
      where: { default_code },
      data: { state: targetState, write_uid: userId, write_date: new Date() },
    })

    await this.mail.log({
      res_id: mat.id,
      message_type: 'notification',
      subject: `State: ${mat.state} → ${targetState}`,
      body: `Action '${action}' executed`,
      tracking: [{ field: 'state', old_value: mat.state, new_value: targetState }],
      author_id: userId,
    })

    return updated
  }

  // ── action_assign_runno (Warehouse assigns permanent code) ─
  async assignRunNumber(default_code: string, userId: number) {
    const mat = await this.findOne(default_code)
    if (!this.partCode.isTemporary(mat.default_code.trim())) {
      throw new UnprocessableEntityException('Run number already assigned')
    }
    const prefix5 = mat.category.prefix_5 ?? 'XXXXX'
    const newCode = await this.partCode.assignRunNumber(prefix5)

    const updated = await this.prisma.materials.update({
      where: { id: mat.id },
      data: { default_code: newCode, write_uid: userId, write_date: new Date() },
    })

    await this.mail.log({
      res_id: mat.id,
      message_type: 'audit',
      subject: 'Run Number Assigned',
      body: `default_code: ${mat.default_code} → ${newCode}`,
      author_id: userId,
    })

    return updated
  }

  // ── GET /materials/:default_code/messages ─────────────────
  getMessages(default_code: string) {
    return this.prisma.materials
      .findUnique({ where: { default_code }, select: { id: true } })
      .then(mat => {
        if (!mat) throw new NotFoundException(`Material ${default_code} not found`)
        return this.mail.thread(mat.id)
      })
  }
}
