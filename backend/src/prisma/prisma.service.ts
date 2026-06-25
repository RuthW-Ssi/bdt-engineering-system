import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      transactionOptions: {
        maxWait: 10000,  // wait up to 10s to acquire a connection
        timeout: 30000,  // transaction must complete within 30s (Supabase latency)
      },
    })
  }

  async onModuleInit() {
    await this.$connect()
  }
  async onModuleDestroy() {
    await this.$disconnect()
  }
}
