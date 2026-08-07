import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'

// Admin-only, including reads — deliberately does NOT follow the general
// read-all rule. Seeing every account + its permission grants is sensitive
// account/security-administration data, not business data.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest()
    if (user?.role !== 'admin') throw new ForbiddenException('Admin only')
    return true
  }
}
