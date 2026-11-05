import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Pool size per process from env (2026-11-04, load-readiness): Prisma's default
 * is num_cpus × 2 + 1 = 3 on a 1-vCPU Cloud Run instance, far below the
 * requests one instance takes at once. DB_CONNECTION_LIMIT / DB_POOL_TIMEOUT
 * set (or override) those params on DATABASE_URL so the deploy can tune them
 * without editing the secret. Unset → the URL is used exactly as given.
 */
export function withPoolParams(url: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!url || (!env.DB_CONNECTION_LIMIT && !env.DB_POOL_TIMEOUT)) return url
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url // unparseable (e.g. an unencoded '#' in the password): keep it as is rather than fail startup
  }
  if (env.DB_CONNECTION_LIMIT) u.searchParams.set('connection_limit', env.DB_CONNECTION_LIMIT)
  if (env.DB_POOL_TIMEOUT) u.searchParams.set('pool_timeout', env.DB_POOL_TIMEOUT)
  return u.toString()
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = withPoolParams(process.env.DATABASE_URL)
    super({
      ...(url ? { datasources: { db: { url } } } : {}),
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
