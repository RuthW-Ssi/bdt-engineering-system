import {
  CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor, NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Observable, map } from 'rxjs'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../modules/auth/auth.service'
import { CUSTOMER_ACCESS_KEY, CustomerAccessOptions } from './customer-accessible.decorator'
import { stripCustomerFields } from './strip-customer-fields'

// Global (APP_INTERCEPTOR) default-deny gate for customer users. Runs after the
// controller guards, so `req.user` is already set on JWT-guarded routes; on
// routes without JwtAuthGuard it verifies the bearer token itself so an
// ungated controller can't become a customer loophole.
//   employee → untouched
//   customer → 403 unless the route is @CustomerAccessible (GET only), 404 if the
//              route's project isn't the customer's company, weights/dates stripped
@Injectable()
export class CustomerScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (ctx.getType() !== 'http') return next.handle()
    const req = ctx.switchToHttp().getRequest()
    const userId = this.userId(req)
    if (!userId) return next.handle()

    // Read live, not from the token, so an employee↔customer switch applies immediately
    const user = await this.prisma.res_users.findUnique({
      where: { id: userId },
      select: { user_type: true, partner_id: true },
    })
    if (user?.user_type !== 'customer') return next.handle()

    const opts = this.reflector.getAllAndOverride<CustomerAccessOptions | undefined>(CUSTOMER_ACCESS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!opts) throw new ForbiddenException('Not available for customer accounts')
    if (opts.selfService) return next.handle()
    if (req.method !== 'GET') throw new ForbiddenException('Customer accounts are read-only')
    if (!user.partner_id) throw new ForbiddenException('Customer account has no company')

    if (opts.projectList) {
      req.query.customer_id = String(user.partner_id)
    } else {
      const owners = await this.resolveProjectOwners(req, opts)
      if (owners.length === 0) throw new ForbiddenException('A project scope is required')
      if (owners.some((o) => o !== user.partner_id)) throw new NotFoundException('Not found')
    }

    return next.handle().pipe(map(stripCustomerFields))
  }

  private userId(req: { user?: JwtPayload; headers: Record<string, string | undefined> }): number | undefined {
    if (req.user?.sub) return req.user.sub
    const auth = req.headers['authorization']
    if (!auth?.startsWith('Bearer ')) return undefined
    try {
      return this.jwt.verify<JwtPayload>(auth.slice(7)).sub
    } catch {
      return undefined
    }
  }

  // customer_id of every project the request points at; null = unknown/not found.
  // Every identifying param is checked, so mixing an owned project with a foreign zone fails.
  private async resolveProjectOwners(
    req: { params: Record<string, string>; query: Record<string, unknown> },
    opts: CustomerAccessOptions,
  ): Promise<(number | null)[]> {
    const { params, query } = req
    const q = (k: string) => (typeof query[k] === 'string' && query[k] !== '' ? (query[k] as string) : undefined)
    const int = (v: string) => (/^\d+$/.test(v) ? Number(v) : -1)
    const owners: Promise<number | null>[] = []

    const byProject = (where: { id: number } | { project_code: string }) =>
      this.prisma.project.findUnique({ where: where as never, select: { customer_id: true } }).then((p) => p?.customer_id ?? null)

    if (params.project_code) owners.push(byProject({ project_code: params.project_code }))
    if (params.projectId) owners.push(byProject({ id: int(params.projectId) }))
    if (q('project_id')) owners.push(byProject({ id: int(q('project_id')!) }))

    for (const zoneId of [params.zoneId, params.zone_id, q('zone_id')].filter(Boolean) as string[]) {
      owners.push(
        this.prisma.project_zone
          .findUnique({ where: { id: int(zoneId) }, select: { project: { select: { customer_id: true } } } })
          .then((z) => z?.project.customer_id ?? null),
      )
    }
    if (q('sub_zone_id')) {
      owners.push(
        this.prisma.sub_zone
          .findUnique({
            where: { id: int(q('sub_zone_id')!) },
            select: { zone: { select: { project: { select: { customer_id: true } } } } },
          })
          .then((s) => s?.zone.project.customer_id ?? null),
      )
    }
    if (opts.idParam === 'bim_model' && params.id) {
      owners.push(
        this.prisma.bim_model
          .findUnique({ where: { id: int(params.id) }, select: { project: { select: { customer_id: true } } } })
          .then((m) => m?.project.customer_id ?? null),
      )
    }
    if (opts.drawingFileKey && q('key')) {
      owners.push(
        this.prisma.drawing
          .findFirst({ where: { file_key: q('key') }, select: { project: { select: { customer_id: true } } } })
          .then((d) => d?.project.customer_id ?? null),
      )
    }
    return Promise.all(owners)
  }
}
