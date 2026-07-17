import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common'
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

// Calls the external `bdt-cutting-plan-service` (Cloud Run, repo
// RuthW-Ssi/bdt-cutting-plan-system) — stateless .txt nesting-report parser.
// Auth is Cloud Run IAM (Google-signed ID token, aud = the service URL itself),
// not an API key — see docs/api.md in that repo.
@Injectable()
export class CuttingPlanApiClient {
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

    const res = await fetch(this.audience!, { method: 'POST', headers, body: form })
    const body = await res.json().catch(() => null)

    if (!res.ok) {
      const message = body?.description ?? body?.message ?? `Cutting Plan API error (${res.status})`
      if (res.status === 400) throw new BadRequestException(message)
      throw new InternalServerErrorException(message)
    }

    return body as CuttingPlanApiResponse
  }
}
