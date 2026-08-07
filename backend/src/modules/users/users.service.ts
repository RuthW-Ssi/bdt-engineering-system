import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import * as bcryptjs from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { ROLE_TEMPLATE } from '../../common/permissions/permission-modules'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { SetPermissionsDto } from './dto/set-permissions.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { QueryUserDto } from './dto/query-user.dto'

const LIST_SELECT = {
  id: true,
  login: true,
  name: true,
  email: true,
  role: true,
  level: true,
  job_title: true,
  active: true,
  create_date: true,
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUserDto) {
    const page = Number(query.page ?? 1)
    const limit = Number(query.limit ?? 50)
    const skip = (page - 1) * limit
    const active = query.active !== 'false'

    const where = {
      active,
      ...(query.search
        ? {
            OR: [
              { login: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.res_users.count({ where }),
      this.prisma.res_users.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit, select: LIST_SELECT }),
    ])

    return { total, page, limit, items }
  }

  async findOne(id: number) {
    const user = await this.prisma.res_users.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        module_permissions: { select: { module: true, can_view: true, can_create: true, can_update: true, can_delete: true } },
      },
    })
    if (!user) throw new NotFoundException(`User #${id} not found`)
    return user
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.res_users.findUnique({ where: { login: dto.login } })
    if (existing) throw new ConflictException(`Login "${dto.login}" already exists`)

    const hash = await bcryptjs.hash(dto.password, 12)
    const permissions =
      dto.permissions ??
      (dto.role === 'admin'
        ? []
        : (ROLE_TEMPLATE[dto.role] ?? []).map((module) => ({
            module,
            can_view: true,
            can_create: true,
            can_update: true,
            can_delete: true,
          })))

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.res_users.create({
        data: {
          login: dto.login,
          name: dto.name,
          password: hash,
          role: dto.role,
          level: dto.level,
          job_title: dto.job_title,
        },
        select: LIST_SELECT,
      })
      if (permissions.length) {
        await tx.user_module_permission.createMany({
          data: permissions.map((p) => ({
            user_id: user.id,
            module: p.module,
            can_view: p.can_view,
            can_create: p.can_create,
            can_update: p.can_update,
            can_delete: p.can_delete,
          })),
          skipDuplicates: true,
        })
      }
      return user
    })
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id)
    return this.prisma.res_users.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.job_title !== undefined && { job_title: dto.job_title }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      select: LIST_SELECT,
    })
  }

  async setPermissions(id: number, dto: SetPermissionsDto) {
    await this.findOne(id)
    return this.prisma.$transaction(async (tx) => {
      await tx.user_module_permission.deleteMany({ where: { user_id: id } })
      if (dto.permissions.length) {
        await tx.user_module_permission.createMany({
          data: dto.permissions.map((p) => ({
            user_id: id,
            module: p.module,
            can_view: p.can_view,
            can_create: p.can_create,
            can_update: p.can_update,
            can_delete: p.can_delete,
          })),
          skipDuplicates: true,
        })
      }
      return tx.user_module_permission.findMany({
        where: { user_id: id },
        select: { module: true, can_view: true, can_create: true, can_update: true, can_delete: true },
      })
    })
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    await this.findOne(id)
    const hash = await bcryptjs.hash(dto.password, 12)
    await this.prisma.res_users.update({ where: { id }, data: { password: hash } })
    return { ok: true }
  }
}
