import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { pick } from 'stream-json/filters/Pick'
import { streamArray } from 'stream-json/streamers/StreamArray'

const AUTH_URL = 'https://developer.api.autodesk.com/authentication/v2/token'
const OSS_URL = 'https://developer.api.autodesk.com/oss/v2'
const MD_URL = 'https://developer.api.autodesk.com/modelderivative/v2'
const SERVER_SCOPES = 'data:read data:write data:create bucket:create bucket:read'
const VIEWER_SCOPES = 'viewables:read'

// This app's OSS buckets live in the (default) US region — briefly moved to
// JPN on 2026-08-26 to match where Cloud Run/Vercel/Supabase run, then
// reverted the same day: Model Derivative translate jobs against a JPN
// bucket got hard-denied with 403 "Token exchange access denied — Policy
// 'ProductAccessRequiresCapacity' has effect: deny", confirmed via a live
// side-by-side test (a fresh US-region bucket passed the same entitlement
// check that JPN failed). This is an Autodesk-side capacity/entitlement
// limitation on this account, scoped to region, not a header or code bug —
// this account only has Model Derivative capacity provisioned for US. No
// `region` header is sent below: Autodesk's Model Derivative API defaults to
// US when the header is omitted, which now matches every bucket's actual
// region again.

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
// metadata/properties. No Prisma/domain logic here — see BimService /
// DrawingApsService. Shared by two independent features (BIM, Drawing) that
// each own a separate OSS bucket — every bucket-scoped method takes an
// explicit `bucketKey` (defaulting to the BIM bucket for backward
// compatibility with BIM's existing call sites, which never pass one).
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
    return process.env.APS_BIM_BUCKET_KEY || 'bdt-bim-dev'
  }
  get drawingBucketKey() {
    return process.env.APS_DRAWING_BUCKET_KEY || 'bdt-drawing-dev'
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

  async ensureBucket(bucketKey: string = this.bucketKey): Promise<void> {
    const token = await this.getAccessToken()
    const res = await fetch(`${OSS_URL}/buckets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketKey, policyKey: 'persistent' }),
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
  async createSignedUpload(objectKey: string, bucketKey: string = this.bucketKey): Promise<{ uploadKey: string; url: string }> {
    const token = await this.getAccessToken()
    const signRes = await fetch(
      `${OSS_URL}/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!signRes.ok) {
      throw new InternalServerErrorException(`APS signed upload URL request failed (${signRes.status})`)
    }
    const { uploadKey, urls } = await signRes.json()
    return { uploadKey, url: urls[0] }
  }

  // Mirrors createSignedUpload()'s shape but for reads — mints a short-lived
  // signed GET URL for an object already in an OSS bucket. Used by the BIM
  // GCS backup-copy step (BimBackupService) and by DrawingApsService's
  // GCS-to-APS push (opposite direction, same primitive).
  async getSignedDownloadUrl(objectKey: string, bucketKey: string = this.bucketKey): Promise<string> {
    const token = await this.getAccessToken()
    const res = await fetch(
      `${OSS_URL}/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3download`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      throw new InternalServerErrorException(`APS signed download URL request failed (${res.status})`)
    }
    const { url } = await res.json()
    return url
  }

  // Called after the browser's (or our own backend's, for Drawing) direct PUT
  // to the signed URL succeeds — finalizes the OSS object and returns the URN
  // Model Derivative needs.
  async completeUpload(objectKey: string, uploadKey: string, bucketKey: string = this.bucketKey): Promise<{ urn: string }> {
    const token = await this.getAccessToken()
    const completeRes = await fetch(
      `${OSS_URL}/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
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

  // `views` defaults to ['3d'] to keep BIM's existing IFC/Tekla call sites
  // unchanged — Drawing's DWG preview passes ['2d'] instead (DWG carries 2D
  // sheet data, not a 3D model; requesting '3d' for it would fail or produce
  // nothing useful).
  async translate(urn: string, views: Array<'2d' | '3d'> = ['3d']): Promise<void> {
    await this.deleteManifest(urn)
    const token = await this.getAccessToken()
    const res = await fetch(`${MD_URL}/designdata/job`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { urn },
        output: { formats: [{ type: 'svf2', views }] },
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

  // Streams the flat per-element property collection for the first (3D) view
  // in the manifest — this is what BimService extracts bim_element rows from.
  // Yields one item at a time via stream-json instead of buffering the whole
  // response (res.json()) into memory: confirmed 2026-07-21 a real IFC's
  // properties payload OOM'd a 2GiB container (2312MiB used) when loaded
  // whole, on top of the metadata fetch + per-element property groups (kept
  // in full, per bim_element.properties) meaning the raw payload is easily
  // multiple GB for a large model. Called twice by extractAndPersist() (once
  // to index assemblies, once to build rows) — an extra APS API round-trip
  // is cheap next to holding the entire collection in memory twice over.
  async *streamProperties(urn: string): AsyncGenerator<ApsPropertyItem> {
    const token = await this.getAccessToken()
    const authHeader = { Authorization: `Bearer ${token}` }

    const metaRes = await fetch(`${MD_URL}/designdata/${urn}/metadata`, { headers: authHeader })
    if (!metaRes.ok) {
      throw new InternalServerErrorException(`APS metadata fetch failed (${metaRes.status})`)
    }
    const metaBody = await metaRes.json()
    const guid = metaBody?.data?.metadata?.[0]?.guid
    if (!guid) return

    // forceget=true is required by Autodesk once a property set is large
    // enough to trip their "confirm you really want this" guard — without it
    // the endpoint returns 413 with a diagnostic telling you to add it.
    const propsRes = await fetch(`${MD_URL}/designdata/${urn}/metadata/${guid}/properties?forceget=true`, { headers: authHeader })
    // 202 means Autodesk is still generating the properties database — it's
    // a 2xx (`res.ok` is true) but there's no collection yet. BimService
    // already gates on hasQueryableMetadata() before calling this, so in
    // practice this shouldn't fire — but fail loud rather than silently
    // yielding nothing (which previously looked like "0 elements" success).
    if (propsRes.status !== 200) {
      throw new InternalServerErrorException(`APS properties not ready yet (status ${propsRes.status})`)
    }
    if (!propsRes.body) return

    const pipeline = chain([
      Readable.fromWeb(propsRes.body as NodeWebReadableStream<Uint8Array>),
      parser(),
      pick({ filter: 'data.collection' }),
      streamArray(),
    ])
    for await (const { value } of pipeline) {
      yield value as ApsPropertyItem
    }
  }
}
