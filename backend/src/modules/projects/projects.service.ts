import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailMessageService } from '../mail/mail-message.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { QueryProjectDto } from './dto/query-project.dto'
import { assertProjectTransition, PROJECT_ACTIONS } from './projects.state-machine'
import type { Prisma } from '@prisma/client'

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async create(dto: CreateProjectDto, userId: number) {
    const project = await this.prisma.project.create({
      data: {
        project_code: dto.project_code,
        name: dto.name,
        customer_id: dto.customer_id,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        target_handover: dto.target_handover ? new Date(dto.target_handover) : undefined,
        state: 'lead',
        create_uid: userId,
        write_uid: userId,
      },
    })

    await this.mail.log({
      model: 'project',
      res_id: project.id,
      message_type: 'audit',
      subject: 'Project Created',
      body: `Project ${project.project_code} created`,
      author_id: userId,
    })

    return project
  }

  async findAll(query: QueryProjectDto) {
    const { state, q, customer_id, page = 1, limit = 20 } = query
    const skip = (page - 1) * limit

    const where: Prisma.projectWhereInput = {
      active: true,
      ...(state ? { state } : {}),
      ...(customer_id ? { customer_id } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { project_code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { write_date: 'desc' },
        include: {
          customer: { select: { id: true, name: true, ref: true } },
          write_user: { select: { id: true, name: true } },
          _count: { select: { zones: true, products: true } },
        },
      }),
    ])

    return { total, page, limit, pages: Math.ceil(total / limit), items }
  }

  async findOne(project_code: string) {
    const proj = await this.prisma.project.findUnique({
      where: { project_code },
      include: {
        customer: { select: { id: true, name: true, ref: true } },
        zones: { where: { active: true }, orderBy: { erection_sequence: 'asc' } },
        create_user: { select: { id: true, name: true } },
        write_user: { select: { id: true, name: true } },
      },
    })
    if (!proj) throw new NotFoundException(`Project ${project_code} not found`)
    return proj
  }

  async update(project_code: string, dto: UpdateProjectDto, userId: number) {
    const proj = await this.findOne(project_code)

    const tracking: { field: string; old_value: unknown; new_value: unknown }[] = []
    for (const key of Object.keys(dto) as (keyof UpdateProjectDto)[]) {
      const old = (proj as any)[key]
      const nw = (dto as any)[key]
      if (old !== nw) tracking.push({ field: key, old_value: old, new_value: nw })
    }

    const updated = await this.prisma.project.update({
      where: { project_code },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.customer_id !== undefined ? { customer_id: dto.customer_id } : {}),
        ...(dto.start_date ? { start_date: new Date(dto.start_date) } : {}),
        ...(dto.target_handover ? { target_handover: new Date(dto.target_handover) } : {}),
        write_uid: userId,
        write_date: new Date(),
      },
    })

    if (tracking.length) {
      await this.mail.log({
        model: 'project',
        res_id: proj.id,
        message_type: 'audit',
        subject: 'Project Updated',
        body: `${tracking.length} field(s) changed`,
        tracking,
        author_id: userId,
      })
    }

    return updated
  }

  async doAction(project_code: string, action: string, userId: number) {
    const proj = await this.findOne(project_code)
    const targetState = PROJECT_ACTIONS[action]
    if (!targetState) throw new UnprocessableEntityException(`Unknown action: ${action}`)
    assertProjectTransition(proj.state, targetState)

    const updated = await this.prisma.project.update({
      where: { project_code },
      data: { state: targetState, write_uid: userId, write_date: new Date() },
    })

    await this.mail.log({
      model: 'project',
      res_id: proj.id,
      message_type: 'notification',
      subject: `State: ${proj.state} → ${targetState}`,
      body: `Action '${action}' executed`,
      tracking: [{ field: 'state', old_value: proj.state, new_value: targetState }],
      author_id: userId,
    })

    return updated
  }
}
