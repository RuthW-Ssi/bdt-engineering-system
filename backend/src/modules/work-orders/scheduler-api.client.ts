import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common'
import { GoogleAuth, IdTokenClient } from 'google-auth-library'

export const SCHEDULE_DIRECTIONS = ['event', 'backward', 'forward', 'alap'] as const
export const DISPATCH_RULES = ['EDD', 'CR', 'SPT', 'FIFO'] as const
export type ScheduleDirection = (typeof SCHEDULE_DIRECTIONS)[number]
export type DispatchRule = (typeof DISPATCH_RULES)[number]

/** Body of `POST /schedule` on prod-scheduler (ADR-0015). */
export interface ScheduleRunRequest {
  direction: ScheduleDirection
  dispatch_rule: DispatchRule
  activate: boolean
  persist: boolean
  /** ISO-8601 with offset, e.g. "2026-10-03T08:30:00+07:00". */
  now: string
  /** JWT login; stored in prod_schedule_version.created_by (max 120 chars). */
  requested_by: string
  /** Limit the run to these WOs; omitted = every schedulable WO. */
  work_order_ids?: number[]
}

/** backend-schedule/app/solver/kpi.py compute(). */
export interface ScheduleKpi {
  work_orders: number
  feasible: boolean
  line_overlaps: number
  span_start: string | null
  span_end: string | null
  makespan_days: number
  late_vs_due: number
  start_before_now: number
  total_tardiness_hours: number
}

export interface ScheduleRunResult {
  direction: ScheduleDirection
  dispatch_rule: DispatchRule
  kpi: ScheduleKpi
  /** Productive minutes per workcenter_line id (JSON keys are strings). */
  line_load_min: Record<string, number>
  version_id: number | null
  version_code: string | null
  is_active: boolean
  requested_by: string
  /** WOs left out of the run and why (Thai). */
  skipped?: ScheduleSkippedWo[]
  /** Started WOs that kept a line busy until their plan_finish. */
  reserved?: ScheduleReservedLine[]
}

export interface ScheduleSkippedWo { wo_id: number; wo_code: string; reason: string }
export interface ScheduleReservedLine { wo_code: string; line_id: number; until: string }

const TIMEOUT_MS = 60_000

// Calls the `prod-scheduler` Cloud Run service (backend-schedule/, FastAPI) —
// ADR-0015. Same IAM pattern as CuttingPlanApiClient: Google-signed ID token,
// aud = the service URL. The Python body is never forwarded on unexpected
// errors; only the typed 409 / 422 data_not_ready messages reach the client.
@Injectable()
export class SchedulerApiClient {
  private readonly logger = new Logger(SchedulerApiClient.name)
  private readonly baseUrl = process.env.SCHEDULER_API_URL
  private readonly auth = new GoogleAuth()
  private idTokenClientPromise?: Promise<IdTokenClient>

  private getClient(url: string): Promise<IdTokenClient> {
    // getRequestHeaders() refreshes the token itself — caching the client is safe.
    // A failed lookup is not cached, so e.g. a later `gcloud auth application-default login` takes effect.
    if (!this.idTokenClientPromise) {
      this.idTokenClientPromise = this.auth.getIdTokenClient(url).catch((err) => {
        this.idTokenClientPromise = undefined
        throw err
      })
    }
    return this.idTokenClientPromise
  }

  async run(req: ScheduleRunRequest): Promise<ScheduleRunResult> {
    if (!this.baseUrl) {
      throw new InternalServerErrorException('Scheduler service is not configured')
    }
    let headers: Headers
    if (isLocalSchedulerUrl(this.baseUrl)) {
      // Local dev: backend-schedule/scripts/dev.sh on http://localhost:8100 has no Cloud Run IAM.
      headers = new Headers()
    } else {
      try {
        const client = await this.getClient(this.baseUrl)
        headers = await client.getRequestHeaders()
      } catch (err) {
        this.logger.error(`Scheduler ID token failed: ${err instanceof Error ? err.message : String(err)}`)
        throw new InternalServerErrorException('Scheduler failed')
      }
    }
    headers.set('Content-Type', 'application/json')

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/schedule`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      if (isAbort(err)) throw new GatewayTimeoutException('Scheduler timed out')
      this.logger.error(`Scheduler request failed: ${err instanceof Error ? err.message : String(err)}`)
      throw new InternalServerErrorException('Scheduler failed')
    }

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const message = typeof body?.message === 'string' ? body.message : undefined

    if (res.ok && body) return body as unknown as ScheduleRunResult
    if (res.status === 409) {
      throw new ConflictException(message ?? 'A scheduler run is already in progress')
    }
    if (res.status === 422 && body?.code === 'data_not_ready') {
      const reasons = Array.isArray(body.reasons) ? body.reasons.filter((r) => typeof r === 'string') : []
      throw new UnprocessableEntityException({ message: message ?? 'Scheduler input data is not ready', reasons })
    }
    this.logger.error(`Scheduler returned HTTP ${res.status}`)
    // 401/403 come from Cloud Run IAM (missing run.invoker / wrong audience): our misconfiguration, not the user's
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
      throw new BadRequestException('Scheduler rejected the request')
    }
    throw new InternalServerErrorException('Scheduler failed')
  }
}

/** Exactly http://localhost or http://127.0.0.1 (any port) — never a look-alike host or https. */
function isLocalSchedulerUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

// AbortSignal.timeout() rejects with a DOMException named "TimeoutError".
function isAbort(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}
