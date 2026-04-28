import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'
import { CreateDrawingDto } from '../dto/create-drawing.dto'
import { UpdateDrawingDto } from '../dto/update-drawing.dto'
import { AddRevisionDto } from '../dto/add-revision.dto'
import { QueryDrawingDto } from '../dto/query-drawing.dto'
import { assertDrawingTransition } from '../drawings.state-machine'
import type { Prisma } from '@prisma/client'

const REVISION_SEQUENCE_MAP: Record<string, number> = {
  A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8, I:9, J:10,
  K:11, L:12, M:13, N:14, O:15, P:16, Q:17, R:18, S:19,
  T:20, U:21, V:22, W:23, X:24, Y:25, Z:26,
  IFC:99, AB:100,
}

@Injectable()
export class DrawingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async create(dto: CreateDrawingDto, uid: number) {
    const product = await this.prisma.products.findUnique({
      where: { product_code: dto.product_code },
    })
    if (!product) throw new NotFoundException(`Product ${dto.product_code} not found`)

    if (dto.drawing_type === 'project' && !dto.project_id) {
      throw new BadRequestException('project_id is required when drawing_type is "project"')
    }
    if (dto.drawing_type === 'master' && dto.project_id) {
      throw new BadRequestException('project_id must not be set when drawing_type is "master"')
    }

    const drawing = await this.prisma.shop_drawing.create({
      data: {
        drawing_number: dto.drawing_number,
        drawing_type: dto.drawing_type,
        product_id: product.id,
        project_id: dto.project_id,
        cad_source: dto.cad_source ?? 'other',
        state: 'draft',
        create_uid: uid,
        write_uid: uid,
      },
      include: {
        product: { select: { id: true, product_code: true, name: true } },
        project: { select: { id: true, project_code: true, name: true } },
      },
    })

    await this.mail.log({
      model: 'product',
      res_id: drawing.id,
      message_type: 'audit',
      subject: 'Drawing Created',
      body: `Drawing ${drawing.drawing_number} (${drawing.drawing_type}) created`,
      author_id: uid,
    })

    return drawing
  }

  async findAll(query: QueryDrawingDto) {
    let productId: number | undefined
    if (query.product_code) {
      const product = await this.prisma.products.findUnique({
        where: { product_code: query.product_code },
        select: { id: true },
      })
      if (!product) throw new NotFoundException(`Product ${query.product_code} not found`)
      productId = product.id
    }

    const where: Prisma.shop_drawingWhereInput = {
      ...(productId ? { product_id: productId } : {}),
      ...(query.drawing_type ? { drawing_type: query.drawing_type } : {}),
      ...(query.project_id ? { project_id: query.project_id } : {}),
      ...(query.state ? { state: query.state } : {}),
    }

    return this.prisma.shop_drawing.findMany({
      where,
      orderBy: { create_date: 'desc' },
      include: {
        product: { select: { id: true, product_code: true, name: true } },
        project: { select: { id: true, project_code: true, name: true } },
      },
    })
  }

  async findOne(id: number) {
    const drawing = await this.prisma.shop_drawing.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, product_code: true, name: true } },
        project: { select: { id: true, project_code: true, name: true } },
        revisions: {
          orderBy: { sequence: 'asc' },
          include: {
            approver: { select: { id: true, name: true } },
            create_user: { select: { id: true, name: true } },
          },
        },
        create_user: { select: { id: true, name: true } },
        write_user: { select: { id: true, name: true } },
      },
    })
    if (!drawing) throw new NotFoundException(`Drawing ${id} not found`)
    return drawing
  }

  async update(id: number, dto: UpdateDrawingDto, uid: number) {
    const drawing = await this.findOne(id)
    if (drawing.state !== 'draft') {
      throw new BadRequestException(`Drawing can only be updated in draft state (current: ${drawing.state})`)
    }

    return this.prisma.shop_drawing.update({
      where: { id },
      data: {
        ...(dto.project_id !== undefined ? { project_id: dto.project_id } : {}),
        ...(dto.cad_source !== undefined ? { cad_source: dto.cad_source } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        write_uid: uid,
        write_date: new Date(),
      },
      include: {
        product: { select: { id: true, product_code: true, name: true } },
      },
    })
  }

  async performAction(id: number, action: string, uid: number, approvedUid?: number) {
    const drawing = await this.findOne(id)
    const targetState = assertDrawingTransition(drawing.state as any, action)

    if (action === 'action_approve' && approvedUid) {
      const currentRevision = drawing.revisions.find(r => r.is_current)
      if (currentRevision) {
        await this.prisma.drawing_revision.update({
          where: { id: currentRevision.id },
          data: {
            approved_uid: approvedUid,
            approved_date: new Date(),
          },
        })
      }
    }

    const updated = await this.prisma.shop_drawing.update({
      where: { id },
      data: { state: targetState, write_uid: uid, write_date: new Date() },
    })

    await this.mail.log({
      model: 'product',
      res_id: id,
      message_type: 'notification',
      subject: `State: ${drawing.state} → ${targetState}`,
      body: `Action '${action}' executed`,
      tracking: [{ field: 'state', old_value: drawing.state, new_value: targetState }],
      author_id: uid,
    })

    return updated
  }

  async addRevision(drawingId: number, dto: AddRevisionDto, uid: number) {
    const drawing = await this.findOne(drawingId)

    const newSeq = REVISION_SEQUENCE_MAP[dto.revision]
    if (!newSeq) {
      throw new BadRequestException(`Invalid revision identifier: ${dto.revision}`)
    }

    const lastRevision = drawing.revisions[drawing.revisions.length - 1]
    if (lastRevision && newSeq <= lastRevision.sequence) {
      throw new BadRequestException(
        `Revision '${dto.revision}' (seq ${newSeq}) must be greater than last revision '${lastRevision.revision}' (seq ${lastRevision.sequence})`,
      )
    }

    await this.prisma.$transaction(async tx => {
      if (lastRevision) {
        await tx.drawing_revision.update({
          where: { id: lastRevision.id },
          data: { is_current: false },
        })
      }

      await tx.drawing_revision.create({
        data: {
          drawing_id: drawingId,
          revision: dto.revision,
          sequence: newSeq,
          change_summary: dto.change_summary,
          file_url: dto.file_url,
          file_size_bytes: dto.file_size_bytes ? BigInt(dto.file_size_bytes) : undefined,
          file_mime_type: dto.file_mime_type,
          file_checksum_sha256: dto.file_checksum_sha256,
          is_current: true,
          create_uid: uid,
        },
      })

      await tx.shop_drawing.update({
        where: { id: drawingId },
        data: { current_revision: dto.revision, write_uid: uid, write_date: new Date() },
      })
    })

    return this.findOne(drawingId)
  }

  async getRevisions(drawingId: number) {
    await this.findOne(drawingId)
    return this.prisma.drawing_revision.findMany({
      where: { drawing_id: drawingId },
      orderBy: { sequence: 'desc' },
      include: {
        approver: { select: { id: true, name: true } },
        create_user: { select: { id: true, name: true } },
      },
    })
  }
}
