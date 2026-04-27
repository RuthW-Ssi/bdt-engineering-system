import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../prisma/prisma.service'

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }

  @Get('readyz')
  async readiness() {
    await this.prisma.$queryRaw`SELECT 1`
    return { status: 'ok', db: 'connected' }
  }
}
