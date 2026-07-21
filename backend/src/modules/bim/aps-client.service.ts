import { Injectable, InternalServerErrorException } from '@nestjs/common'

const AUTH_URL = 'https://developer.api.autodesk.com/authentication/v2/token'
const OSS_URL = 'https://developer.api.autodesk.com/oss/v2'
const MD_URL = 'https://developer.api.autodesk.com/modelderivative/v2'
const SERVER_SCOPES = 'data:read data:write data:create bucket:create bucket:read'
const VIEWER_SCOPES = 'viewables:read'

export interface ApsManifest {
  status: 'pending' | 'inprogress' | 'success' | 'failed' | 'timeout'
  progress?: string
  derivatives?: Array<{ status?: string; messages?: Array<{ type: string; message: string }> }>
}

export interface ApsPropertyItem {
  objectid: number
  name: string
  externalId?: string
  properties?: Record<string, Record<string, unknown>>
}

// Thin wrapper over Autodesk Platform Services (APS, formerly Forge): 2-legged
// OAuth, OSS bucket/object upload, Model Derivative translate + manifest +
// metadata/properties. No Prisma/domain logic here — see BimService.
@Injectable()
export class ApsClientService {
  private tokenCache?: { token: string; expiresAt: number }
  private viewerTokenCache?: { token: string; expiresAt: number }

  private get clientId() {
    return process.env.APS_CLIENT_ID
  }
  private get clientSecret() {
    return process.env.APS_CLIENT_SECRET
  }
  get bucketKey() {
    return process.env.APS_BUCKET_KEY || 'bdt-bim-dev'
  }

  private requireCredentials() {
    if (!this.clientId || !this.clientSecret) {
      throw new InternalServerErrorException(
        'APS_CLIENT_ID / APS_CLIENT_SECRET is not configured — see backend/.env.example',
      )
    }
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token
    }
    const token = await this.requestToken(SERVER_SCOPES)
    this.tokenCache = token
    return token.token
  }

  // Server-side calls (bucket/upload/translate/metadata) need the broad
  // read+write scopes above — but that token must never reach the browser.
  // The frontend Viewer SDK only needs to read viewables, so mint it a
  // separately-cached, narrowly-scoped token instead of handing out the
  // write-capable one (it could otherwise create/delete OSS objects directly).
  async getViewerAccessToken(): Promise<string> {
    if (this.viewerTokenCache && this.viewerTokenCache.expiresAt > Date.now()) {
      return this.viewerTokenCache.token
    }
    const token = await this.requestToken(VIEWER_SCOPES)
    this.viewerTokenCache = token
    return token.token
  }

  private async requestToken(scope: string): Promise<{ token: string; expiresAt: number }> {
    this.requireCredentials()
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      throw new InternalServerErrorException(`APS auth failed (${res.status}): ${body?.developerMessage ?? body?.error ?? 'unknown error'}`)
    }
    // Refresh 60s early to avoid racing expiry mid-request.
    return { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 }
  }

  async ensureBucket(): Promise<void> {
    const token = await this.getAccessToken()
    const res = await fetch(`${OSS_URL}/buckets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketKey: this.bucketKey, policyKey: 'persistent' }),
    })
    // 409 = bucket already exists, which is the expected steady state.
    if (!res.ok && res.status !== 409) {
      const body = await res.json().catch(() => null)
      throw new InternalServerErrorException(`APS bucket create failed (${res.status}): ${body?.reason ?? 'unknown error'}`)
    }
  }

  // Split in two (rather than one uploadObject(buffer) taking the raw file)
  // so the actual file bytes go straight from the BROWSER to this signed S3
  // URL — never through our own Cloud Run backend at all. Both Vercel's
  // rewrite-proxy body size limit and Cloud Run's 32MiB HTTP/1 request cap
  // are hard, non-configurable platform ceilings (confirmed 2026-07-21) well
  // under real Tekla IFC export sizes; routing the bytes through our infra
  // at all would 413 regardless of our own 100MB multer limit, which never
  // even gets evaluated since the request dies upstream first.
  async createSignedUpload(objectKey: string): Promise<{ uploadKey: string; url: string }> {
    const token = await this.getAccessToken()
    const signRes = await fetch(
      `${OSS_URL}/buckets/${this.bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!signRes.ok) {
      throw new InternalServerErrorException(`APS signed upload URL request failed (${signRes.status})`)
    }
    const { uploadKey, urls } = await signRes.json()
    return { uploadKey, url: urls[0] }
  }

  // Called after the browser's own direct PUT to the signed URL succeeds —
  // finalizes the OSS object and returns the URN Model Derivative needs.
  async completeUpload(objectKey: string, uploadKey: string): Promise<{ urn: string }> {
    const token = await this.getAccessToken()
    const completeRes = await fetch(
      `${OSS_URL}/buckets/${this.bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadKey }),
      },
    )
    if (!completeRes.ok) {
      throw new InternalServerErrorException(`APS upload finalize failed (${completeRes.status})`)
    }
    const { objectId } = await completeRes.json()
    const urn = Buffer.from(objectId).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    return { urn }
  }

  // Re-translating a urn that already has a manifest (i.e. every retry)
  // appends a second derivative rather than replacing the first — Autodesk
  // does not deterministically reassign the same dbIds across separate
  // translation jobs, so the live Viewer can end up rendering one run's
  // geometry while our stored viewer_ids were read from the metadata of the
  // other. Confirmed 2026-07-20: a retried model's dbId 4438 resolved to the
  // real assembly ("COLUMN") via one manifest geometry guid but to an
  // unrelated bolt via the Viewer's actually-loaded scene. Clearing the
  // manifest before every translate (first upload included, harmless no-op
  // there) guarantees exactly one derivative ever exists for a urn.
  async deleteManifest(urn: string): Promise<void> {
    const token = await this.getAccessToken()
    const res = await fetch(`${MD_URL}/designdata/${urn}/manifest`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok && res.status !== 404) {
      throw new InternalServerErrorException(`APS manifest delete failed (${res.status})`)
    }
  }

  async translate(urn: string): Promise<void> {
    await this.deleteManifest(urn)
    const token = await this.getAccessToken()
    const res = await fetch(`${MD_URL}/designdata/job`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { urn },
        output: { formats: [{ type: 'svf2', views: ['3d'] }] },
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new InternalServerErrorException(`APS translate job failed (${res.status}): ${body?.diagnostic ?? body?.reason ?? 'unknown error'}`)
    }
  }

  async getManifest(urn: string): Promise<ApsManifest> {
    const token = await this.getAccessToken()
    const res = await fetch(`${MD_URL}/designdata/${urn}/manifest`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new InternalServerErrorException(`APS manifest fetch failed (${res.status})`)
    }
    return res.json()
  }

  // The derivative reaching "success" and the properties database being
  // queryable are reported separately by Autodesk, and in TWO stages: (1)
  // GET .../metadata can still return an empty view list for a few seconds
  // right after manifest success, and (2) even once a guid appears there,
  // GET .../metadata/{guid}/properties itself can return 202 (still being
  // generated) rather than 200 — and 202 is still `res.ok`, so it previously
  // passed through getProperties() silently as an empty array. Both stages
  // confirmed 2026-07-20 on the same model. Checks the real endpoint
  // getProperties() will use, not just the metadata list, so BimService can
  // gate processing→complete on it actually being ready.
  async hasQueryableMetadata(urn: string): Promise<boolean> {
    const token = await this.getAccessToken()
    const authHeader = { Authorization: `Bearer ${token}` }
    const metaRes = await fetch(`${MD_URL}/designdata/${urn}/metadata`, { headers: authHeader })
    if (!metaRes.ok) return false
    const metaBody = await metaRes.json()
    const guid = metaBody?.data?.metadata?.[0]?.guid
    if (!guid) return false

    const propsRes = await fetch(`${MD_URL}/designdata/${urn}/metadata/${guid}/properties?forceget=true`, { headers: authHeader })
    if (propsRes.status !== 200) return false
    const propsBody = await propsRes.json()
    return Array.isArray(propsBody?.data?.collection) && propsBody.data.collection.length > 0
  }

  // Returns the flat per-element property collection for the first (3D) view
  // in the manifest — this is what BimService extracts bim_element rows from.
  async getProperties(urn: string): Promise<ApsPropertyItem[]> {
    const token = await this.getAccessToken()
    const authHeader = { Authorization: `Bearer ${token}` }

    const metaRes = await fetch(`${MD_URL}/designdata/${urn}/metadata`, { headers: authHeader })
    if (!metaRes.ok) {
      throw new InternalServerErrorException(`APS metadata fetch failed (${metaRes.status})`)
    }
    const metaBody = await metaRes.json()
    const guid = metaBody?.data?.metadata?.[0]?.guid
    if (!guid) return []

    // forceget=true is required by Autodesk once a property set is large
    // enough to trip their "confirm you really want this" guard — without it
    // the endpoint returns 413 with a diagnostic telling you to add it.
    const propsRes = await fetch(`${MD_URL}/designdata/${urn}/metadata/${guid}/properties?forceget=true`, { headers: authHeader })
    // 202 means Autodesk is still generating the properties database — it's
    // a 2xx (`res.ok` is true) but there's no collection yet. BimService
    // already gates on hasQueryableMetadata() before calling this, so in
    // practice this shouldn't fire — but fail loud rather than silently
    // returning [] (which previously looked like "0 elements" success).
    if (propsRes.status !== 200) {
      throw new InternalServerErrorException(`APS properties not ready yet (status ${propsRes.status})`)
    }
    const propsBody = await propsRes.json()
    return propsBody?.data?.collection ?? []
  }
}
