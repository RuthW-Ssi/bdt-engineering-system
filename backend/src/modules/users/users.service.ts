import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CUSTOMER_VIEW_MODULES } from "../../common/permissions/permission-modules";
import * as bcryptjs from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SetPermissionsDto } from "./dto/set-permissions.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { QueryUserDto } from "./dto/query-user.dto";

const LIST_SELECT = {
  id: true,
  login: true,
  name: true,
  email: true,
  role: true,
  level: true,
  job_title: true,
  user_type: true,
  partner_id: true,
  partner: { select: { id: true, name: true, short_name: true } },
  active: true,
  create_date: true,
};

const CUSTOMER_VIEW_GRANTS = CUSTOMER_VIEW_MODULES.map((module) => ({
  module,
  can_view: true,
  can_create: false,
  can_update: false,
  can_delete: false,
}));

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUserDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    const skip = (page - 1) * limit;
    const active = query.active !== "false";

    const where = {
      active,
      ...(query.search
        ? {
            OR: [
              {
                login: { contains: query.search, mode: "insensitive" as const },
              },
              {
                name: { contains: query.search, mode: "insensitive" as const },
              },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.res_users.count({ where }),
      this.prisma.res_users.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        select: LIST_SELECT,
      }),
    ]);

    return { total, page, limit, items };
  }

  async findOne(id: number) {
    const user = await this.prisma.res_users.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        module_permissions: {
          select: {
            module: true,
            can_view: true,
            can_create: true,
            can_update: true,
            can_delete: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.res_users.findUnique({
      where: { login: dto.login },
    });
    if (existing)
      throw new ConflictException(`Login "${dto.login}" already exists`);

    const type = await this.resolveType(
      dto.user_type ?? "employee",
      dto.partner_id,
    );
    const hash = await bcryptjs.hash(dto.password, 12);
    const permissions = type.isCustomer
      ? CUSTOMER_VIEW_GRANTS
      : (dto.permissions ??
        // No pre-assigned module ownership per department yet — every new user
        // starts with an empty permission set; admin fills them in per user.
        []);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.res_users.create({
        data: {
          login: dto.login,
          name: dto.name,
          password: hash,
          role: type.isCustomer ? "customer" : dto.role,
          level: dto.level,
          job_title: dto.job_title,
          user_type: type.user_type,
          partner_id: type.partner_id,
        },
        select: LIST_SELECT,
      });
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
        });
      }
      return user;
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const current = await this.findOne(id);
    const type = await this.resolveType(
      dto.user_type ?? (current.user_type as "employee" | "customer"),
      dto.partner_id !== undefined ? dto.partner_id : current.partner_id,
    );
    const becameCustomer = type.isCustomer && current.user_type !== "customer";

    return this.prisma.$transaction(async (tx) => {
      if (becameCustomer) {
        await tx.user_module_permission.deleteMany({ where: { user_id: id } });
        await tx.user_module_permission.createMany({
          data: CUSTOMER_VIEW_GRANTS.map((p) => ({ user_id: id, ...p })),
        });
      }
      return tx.res_users.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          user_type: type.user_type,
          partner_id: type.partner_id,
          // customers carry a fixed label so a stale "admin" role can never bypass checks
          ...(type.isCustomer
            ? { role: "customer" }
            : dto.role !== undefined && { role: dto.role }),
          ...(dto.level !== undefined && { level: dto.level }),
          ...(dto.job_title !== undefined && { job_title: dto.job_title }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
        select: LIST_SELECT,
      });
    });
  }

  // Customer ⇒ must belong to an existing company; employee ⇒ no company link.
  private async resolveType(
    userType: "employee" | "customer",
    partnerId: number | null | undefined,
  ) {
    if (userType !== "customer")
      return { isCustomer: false, user_type: "employee", partner_id: null };
    if (!partnerId)
      throw new BadRequestException(
        "Customer users must be linked to a customer company",
      );
    const partner = await this.prisma.res_partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner)
      throw new BadRequestException(`Customer #${partnerId} not found`);
    return { isCustomer: true, user_type: "customer", partner_id: partnerId };
  }

  async setPermissions(id: number, dto: SetPermissionsDto) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.user_module_permission.deleteMany({ where: { user_id: id } });
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
        });
      }
      return tx.user_module_permission.findMany({
        where: { user_id: id },
        select: {
          module: true,
          can_view: true,
          can_create: true,
          can_update: true,
          can_delete: true,
        },
      });
    });
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    await this.findOne(id);
    const hash = await bcryptjs.hash(dto.password, 12);
    await this.prisma.res_users.update({
      where: { id },
      data: { password: hash },
    });
    return { ok: true };
  }
}
