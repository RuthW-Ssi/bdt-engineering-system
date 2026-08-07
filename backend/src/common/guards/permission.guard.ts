import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../../prisma/prisma.service'
import { PERMISSION_KEY, PermissionRequirement } from '../decorators/permission.decorator'
import { hasPermission } from '../permissions/permission-map'

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requirement) return true

    const { user } = context.switchToHttp().getRequest()
    const allowed = await hasPermission(this.prisma, user?.sub, user?.role, requirement.module, requirement.action)
    if (!allowed) throw new ForbiddenException('Insufficient permission')
    return true
  }
}
