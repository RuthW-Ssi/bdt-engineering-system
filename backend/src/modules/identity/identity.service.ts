import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUser(xUserId: string | undefined): Promise<number> {
    const id = parseInt(xUserId ?? '1', 10)
    if (isNaN(id)) throw new BadRequestException('Invalid x-user-id header')
    const user = await this.prisma.res_users.findFirst({ where: { id, active: true } })
    if (!user) {
      // Auto-provision for dev convenience — real JWT in Sprint 3
      const first = await this.prisma.res_users.findFirst({ where: { active: true } })
      return first?.id ?? 1
    }
    return user.id
  }
}
