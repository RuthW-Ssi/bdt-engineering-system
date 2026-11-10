import { BadRequestException, Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common'
import { GoogleAuth, IdTokenClient } from 'google-auth-library'

// project_name is intentionally absent — the external API dropped it from
// its contract (2026-07-15): "not part of this API — do not send it".
export interface CuttingPlanApiFields {
  file_id: string
  project_code: string
  tag: string
  description: string
  version: string
  revision: string
}

export interface CuttingPlanApiFile {
  buffer: Buffer
  originalname: string
}

export interface CuttingPlanApiResponse {
  code: number
  status: 'success'
  file_id: string
  description: string
  data: {
    nesting: unknown[][]
    order_part: unknown[][]
    plate_usage: unknown[][]
    remnants?: unknown[][] // omitted entirely (not an empty array) when there's no remnants data
  }
}

// The parser rejected some reports: each one by name, with the parser's message (2026-11-09). The upload
// lists them all (see cutting-plan-report-check.ts) instead of showing one long error string.
export class CuttingPlanReportErrors extends BadRequestException {
  constructor(readonly files: { file: string; message: string }[], message: string) {
    super(message)
  }
}

// A parser that predates the `errors` field sends the same list as a Python repr inside the message
function filesFromMessage(message: string): { file: string; message: string }[] {
  const re = /'File name': '((?:[^'\\]|\\.)*)', 'Error message': (['"])((?:(?!\2\}).)*)\2\}/gs
  return [...message.matchAll(re)].map(m => ({ file: m[1], message: m[3] }))
}

// Calls the external `bdt-cutting-plan-service` (Cloud Run, source in
// `bdt-cutting-plan-service/`) — stateless .txt nesting-report parser.
// Auth is Cloud Run IAM (Google-signed ID token, aud = the service URL itself),
// not an API key — see bdt-cutting-plan-service/docs/api.md.
@Injectable()
export class CuttingPlanApiClient {
  private readonly logger = new Logger(CuttingPlanApiClient.name)
  private readonly audience = process.env.CUTTING_PLAN_API_URL
  private readonly auth = new GoogleAuth()
  private idTokenClientPromise?: Promise<IdTokenClient>

  private async getClient(): Promise<IdTokenClient> {
    if (!this.audience) {
      throw new InternalServerErrorException('CUTTING_PLAN_API_URL is not configured')
    }
    // google-auth-library refreshes the underlying token on each
    // getRequestHeaders() call, so caching the client itself is safe and
    // avoids re-resolving Application Default Credentials on every upload.
    if (!this.idTokenClientPromise) {
      this.idTokenClientPromise = this.auth.getIdTokenClient(this.audience)
    }
    return this.idTokenClientPromise
  }

  async submit(files: CuttingPlanApiFile[], fields: CuttingPlanApiFields): Promise<CuttingPlanApiResponse> {
    const client = await this.getClient()
    const headers = await client.getRequestHeaders()

    const form = new FormData()
    for (const file of files) {
      form.append('files', new Blob([new Uint8Array(file.buffer)]), file.originalname)
    }
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value)
    }

    // The request never got through (parser cold start cut off, network): say so, not a bare 500
    const res = await fetch(this.audience!, { method: 'POST', headers, body: form }).catch((err: Error & { cause?: { code?: string } }) => {
      this.logger.error(`Cutting Plan API unreachable: ${err.cause?.code ?? err.message}`)
      throw new ServiceUnavailableException('Cannot reach the cutting plan parser. Nothing was saved. Please try again.')
    })
    const body = await res.json().catch(() => null)

    if (!res.ok) {
      const message = body?.description ?? body?.message ?? `Cutting Plan API error (${res.status})`
      const files = Array.isArray(body?.errors) && body.errors.length ? body.errors : filesFromMessage(String(message))
      if (files.length) throw new CuttingPlanReportErrors(files, message)
      if (res.status === 400) throw new BadRequestException(message)
      throw new InternalServerErrorException(message)
    }

    return body as CuttingPlanApiResponse
  }
}
